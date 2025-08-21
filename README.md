# Vue d'ensemble du projet

CLOUDITY est un écosystème cloud privé complet offrant plus de 15 applications intégrées, conçu pour fonctionner de manière totalement autonome sans dépendances externes. Le système utilise une architecture multitenant avec isolation stricte des données, collaboration temps réel, et sécurité maximale.

<br />

# Caractéristiques principales

> - **Architecture multitenant** avec base de données partagée PostgreSQL et Row Level Security
> - **19+ microservices** utilisant Go, Rust, Python pour des performances optimales
> - **Suite Office complète** avec collaboration temps réel supportant 100+ utilisateurs simultanés
> - **Applications mobiles natives** pour toutes les fonctionnalités
> - **Sécurité avancée** avec chiffrement XChaCha20-Poly1305, HSM et zero-knowledge
> - **Auto-hébergé** sans services cloud externes (pas d'AWS S3, etc.)

<br />

# Architecture technique globale

## Stack technique

> __Backend__ :
> > - **Authentification**: Go avec hot reload
> > - **Service Mail**: Python/FastAPI
> > - **Service Calendrier**: Go
> > - **Service Drive**: Rust avec versioning
> > - **Service 2FA**: Go
> > - **Password Manager**: Rust avec zero-knowledge
> > - **Wallet**: Rust avec HSM et PCI DSS
> > - **Suite Office**: 
> > - **API Gateway**: Kong + Go custom
> > - **VPN/Proxy**: Go avec water library


> __Frontend__ :
> > - **Web**: React avec Turborepo monorepo
> > - **Temps réel**: Node.js/TypeScript + Socket.io
> > - **Collaboration**: Yjs + TipTap/Luckysheet
> > - **Mobile**: Native (Swift/Kotlin) + Flutter hybride


> __Infrastructure__ :
> > - **Base données**: PostgreSQL multitenant
> > - **Documents**: MongoDB
> > - **Cache**: Redis cluster
> > - **Communication**: gRPC streams
> > - **Orchestration**: Kubernetes + Linkerd
> > - **Monitoring**: Prometheus + Grafana + ELK

<br />

## Architecture microservices
```graph
graph TB
    A[Kong API Gateway] --> B[Service Mesh - Linkerd]
    B --> C[Auth Service - Go]
    B --> D[Mail Service - Python]
    B --> E[Calendar Service - Go]
    B --> F[Drive Service - Rust]
    B --> G[2FA Service - Go]
    B --> H[Password Manager - Rust]
    B --> I[Wallet Service - Rust]
    B --> J[Office Suite Services]
    B --> K[VPN/Proxy Service - Go]
    
    L[PostgreSQL Cluster] --> B
    M[MongoDB] --> B
    N[Redis Cluster] --> B
```

<br />

# Infrastructure multitenant

## PostgreSQL avec Row Level Security

### Schéma de base

```sql
-- Table principale des tenants
CREATE TABLE tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    domain VARCHAR(255) UNIQUE,
    settings JSONB DEFAULT '{}',
    subscription_tier VARCHAR(64) DEFAULT 'starter',
    status VARCHAR(64) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table utilisateurs avec isolation tenant
CREATE TABLE tenant_users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(64) DEFAULT 'user',
    permissions JSONB DEFAULT '[]',
    UNIQUE(tenant_id, email)
);

-- Activation RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- Politique d'isolation
CREATE POLICY tenant_isolation_policy ON tenant_users
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Gestion des connexion avec PgBouncer

```ini
# pgbouncer.ini
[databases]
cloudity_db = host=localhost port=5432 dbname=cloudity_production

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
```
<br />

### Context tenant dans l'application

```javascript
class TenantAwareDB {
    async withTenant(tenantId, callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
```

<br />

# Service backend
## Service d'authentification (Go)

### Structure clean architecture
```go
// internal/auth/domain/user.go
type User struct {
    ID       string `json:"id"`
    Email    string `json:"email"`
    TenantID string `json:"tenant_id"`
}

type UserRepository interface {
    Save(ctx context.Context, user *User) error
    GetByEmail(ctx context.Context, email string) (*User, error)
}
```

### JWT avec rotation des refresh tokens
```go
// internal/auth/jwt/service.go
type JWTService struct {
    secretKey string
}

func (j *JWTService) GenerateToken(userID, tenantID string, roles []string) (string, error) {
    claims := jwt.MapClaims{
        "user_id": userID,
        "tenant_id": tenantID,
        "roles": roles,
        "exp": time.Now().Add(time.Hour * 24).Unix(),
    }
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString([]byte(j.secretKey))
}
```

### mTLS pour communication inter-services
```go
func SetupMTLS() (*tls.Config, error) {
    cert, err := tls.LoadX509KeyPair("certs/server.crt", "certs/server.key")
    caCert, err := ioutil.ReadFile("certs/ca.crt")
    caCertPool := x509.NewCertPool()
    caCertPool.AppendCertsFromPEM(caCert)

    return &tls.Config{
        Certificates: []tls.Certificate{cert},
        ClientAuth:   tls.RequireAndVerifyClientCert,
        ClientCAs:    caCertPool,
    }, nil
}
```

## Service Drive (Rust)
### Content-addressed storage avec déduplication

```rust
use fastcdc::v2020::StreamCDC;
use blake3::Hasher;

pub struct DriveService {
    storage: ContentAddressedStorage,
    chunker: ContentChunker,
    db: PgPool,
}

impl ContentChunker {
    pub async fn chunk_data(&self, data: impl AsyncRead) -> Result<Vec<Chunk>> {
        let chunker = StreamCDC::new(data, 4096, 16384, 65536);
        let mut chunks = Vec::new();
        
        for result in chunker {
            let chunk = result?;
            let content_hash = blake3::hash(&chunk.data);
            chunks.push(Chunk {
                hash: content_hash.to_hex().to_string(),
                data: chunk.data,
                offset: chunk.offset,
                length: chunk.length,
            });
        }
        Ok(chunks)
    }
}
```

### Système de versioning Git-like

```rust
pub async fn store_file_version(
    &self,
    file_id: Uuid,
    data: impl AsyncRead,
) -> Result<FileVersion> {
    let chunks = self.chunker.chunk_data(data).await?;
    let mut chunk_refs = Vec::new();
    
    for chunk in chunks {
        if !self.storage.chunk_exists(&chunk.hash).await? {
            self.storage.store_chunk(&chunk).await?;
        }
        chunk_refs.push(chunk.hash);
    }
    
    let content_hash = self.calculate_merkle_root(&chunk_refs);
    let version_number = self.get_next_version_number(file_id).await?;
    
    Ok(version)
}
```

## Service Mail (Python/FastAPI)
### Architecture avec alias automatiques

```python
from fastapi import FastAPI, WebSocket
from aiosmtpd.controller import Controller
import asyncpg

app = FastAPI()

class EmailAliasHandler:
    async def handle_alias(self, recipient: str, message: EmailMessage):
        # Résolution d'alias pour delhomme.ovh
        if recipient.endswith('@delhomme.ovh'):
            alias_parts = recipient.split('@')[0].split('+')
            base_email = alias_parts[0]
            tags = alias_parts[1:] if len(alias_parts) > 1 else []
            
            # Routage intelligent basé sur les tags
            await self.route_to_mailbox(base_email, tags, message)
```

### SMTP Server avec aiosmtpd

```python
from aiosmtpd.handlers import AsyncMessage

class ClouditySMTPHandler(AsyncMessage):
    async def handle_message(self, message):
        # Spam filtering
        spam_score = await self.check_spam(message)
        if spam_score > 5.0:
            return '550 Message rejected as spam'
        
        # Store in PostgreSQL
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO emails (tenant_id, from_addr, to_addr, subject, body)
                VALUES ($1, $2, $3, $4, $5)
            """, tenant_id, message['From'], message['To'], 
                message['Subject'], message.get_body())
        
        # Real-time notification via WebSocket
        await self.notify_clients(tenant_id, message)
```


## Service VPN/Proxy (Go)
### Implémentation TUN/TAP avec water library
```go
import "github.com/songgao/water"

type TUNService struct {
    iface  *water.Interface
    config Config
}

func NewTUNService(config Config) (*TUNService, error) {
    cfg := water.Config{
        DeviceType: water.TUN,
    }
    cfg.Name = config.DeviceName

    iface, err := water.New(cfg)
    if err != nil {
        return nil, err
    }

    return &TUNService{iface: iface, config: config}, nil
}

func (t *TUNService) handlePackets() {
    buffer := make([]byte, 2000)
    for {
        n, err := t.iface.Read(buffer)
        if err != nil {
            continue
        }
        packet := buffer[:n]
        go t.processPacket(packet)
    }
}
```
<br />

# Applications frontend {#applications-frontend}

## Architecture Monorepo avec Turborepo

```bash
packages/
├── apps/
│   ├── web/              # Application React principale
│   ├── dashboard/        # Dashboard multitenant
│   └── office/           # Suite Office
├── packages/
│   ├── ui/               # Composants partagés
│   ├── editor-core/      # Logique éditeur
│   ├── collaboration/    # Sync temps réel
│   └── types/            # Types TypeScript
```

## Suite office avec collaboration temps réel
### Word-like avec TipTap et Yjs
```typescript
import { Editor } from '@tiptap/core'
import Collaboration from '@tiptap/extension-collaboration'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const ydoc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', 'document-id', ydoc)

const editor = new Editor({
  extensions: [
    StarterKit,
    Collaboration.configure({
      document: ydoc,
    }),
  ],
})
```

### Excel-like avec Luckysheet
```javascript
import Luckysheet from 'luckysheet'

luckysheet.create({
  container: 'spreadsheet-container',
  data: [{
    name: 'Sheet1',
    data: [],
    config: {},
  }],
  lang: 'fr',
  // Intégration Yjs pour collaboration
  collaboration: {
    provider: new WebsocketProvider('ws://localhost:1234', 'sheet-id', ydoc)
  }
})
```

### Gestion d'état avec Zustand
```typescript
import { create } from 'zustand'

interface AppState {
  documents: Document[]
  activeDocument: string | null
  users: User[]
  addDocument: (doc: Document) => void
}

const useAppStore = create<AppState>()((set) => ({
  documents: [],
  activeDocument: null,
  users: [],
  addDocument: (doc) => set((state) => ({
    documents: [...state.documents, doc]
  })),
}))
```

### Support offline avec Service Workers 
```typescript
// Service Worker avec Workbox
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate } from 'workbox-strategies'

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/documents'),
  new StaleWhileRevalidate({
    cacheName: 'documents-cache',
  })
)

// IndexedDB pour stockage local
import { openDB } from 'idb'

const db = await openDB('CloudityOffice', 1, {
  upgrade(db) {
    db.createObjectStore('documents', { keyPath: 'id' })
    db.createObjectStore('offline_changes', { keyPath: 'id' })
  }
})
```


# Applications mobiles {#applications-mobiles}
## Stratégie de développement hybride
> **Application natives** pour services critiques (2FA, Password Manager, Wallet)<br >
> **Flutter** pour applications moins sensibles (Drive, Calendar, Notes) <br >
> **Architecture partagée** avec modules commun

## Architecture iOS (Swift/SwiftUI)
```swift
// Architecture MVVM avec Combine
import SwiftUI
import Combine

class DocumentViewModel: ObservableObject {
    @Published var documents: [Document] = []
    private var cancellables = Set<AnyCancellable>()
    
    func loadDocuments() {
        CloudityAPI.shared.fetchDocuments()
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { [weak self] docs in
                    self?.documents = docs
                }
            )
            .store(in: &cancellables)
    }
}

struct DocumentListView: View {
    @StateObject private var viewModel = DocumentViewModel()
    
    var body: some View {
        List(viewModel.documents) { document in
            DocumentRow(document: document)
        }
        .onAppear {
            viewModel.loadDocuments()
        }
    }
}
```

## Architecture Android (Kotlin/Jetpack Compose)
```kotlin
// Architecture avec Jetpack Compose et Hilt
@Composable
fun DocumentScreen(
    viewModel: DocumentViewModel = hiltViewModel()
) {
    val documents by viewModel.documents.collectAsState()
    
    LazyColumn {
        items(documents) { document ->
            DocumentCard(
                document = document,
                onClick = { viewModel.openDocument(it) }
            )
        }
    }
}

@HiltViewModel
class DocumentViewModel @Inject constructor(
    private val repository: DocumentRepository
) : ViewModel() {
    val documents = repository.getDocuments()
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            emptyList()
        )
}
```

## Authentification biométrique

```swift
// iOS - Face ID/Touch ID
import LocalAuthentication

class BiometricAuth {
    func authenticate(completion: @escaping (Bool) -> Void) {
        let context = LAContext()
        
        context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Accéder à vos données sécurisées"
        ) { success, error in
            DispatchQueue.main.async {
                completion(success)
            }
        }
    }
}
```

```kotlin
// Android - BiometricPrompt
class BiometricAuth(private val activity: FragmentActivity) {
    fun authenticate(onSuccess: () -> Unit) {
        val biometricPrompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult
                ) {
                    onSuccess()
                }
            }
        )
        
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Authentification requise")
            .setNegativeButtonText("Annuler")
            .build()
            
        biometricPrompt.authenticate(promptInfo)
    }
}
```
<br >

# Infrastructure Kubernetes {#infrastructure-kubernetes}

### Architecture cluster multi-tenant
```yaml
# Namespace configuration
apiVersion: v1
kind: Namespace
metadata:
  name: production-services
  annotations:
    linkerd.io/inject: enabled
---
# Network Policy pour isolation
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: tenant-isolation
  namespace: production-services
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: production-services
```

### Déploiements avec Helm
```yaml
# values.yaml pour service générique
replicaCount: 3

image:
  repository: cloudity/service-name
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
```

### Service Mesh avec Linkerd
```bash
# Installation Linkerd
curl --proto '=https' --tlsv1.2 -sSfL https://run.linkerd.io/install | sh
linkerd install | kubectl apply -f -

# Injection automatique
kubectl annotate namespace production-services linkerd.io/inject=enabled
```

### Kong API Gateway
```yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: rate-limiting
config:
  minute: 100
  hour: 1000
  policy: redis
plugin: rate-limiting
---
apiVersion: configuration.konghq.com/v1
kind: KongIngress
metadata:
  name: api-gateway
route:
  methods: [GET, POST, PUT, DELETE]
upstream:
  algorithm: round-robin
  healthchecks:
    active:
      healthy:
        interval: 10
        successes: 3
```

### Monitoring avec Prometheus et Grafana
```yaml
# ServiceMonitor pour Prometheus
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: cloudity-services
spec:
  selector:
    matchLabels:
      monitoring: "true"
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
```

### GitOps avec ArgoCD
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: cloudity-platform
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/cloudity/k8s-manifests
    targetRevision: HEAD
    path: production
  destination:
    server: https://kubernetes.default.svc
    namespace: production-services
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```


<br >

# Sécurité et conformité {#sécurité-conformité}

### Chiffrement avancé XChaCha20-Poly1305
```rust
use chacha20poly1305::{XChaCha20Poly1305, Key, Nonce, aead::{Aead, NewAead}};

pub struct PasswordVault {
    cipher: XChaCha20Poly1305,
}

impl PasswordVault {
    pub fn encrypt_password(&self, password: &str) -> Result<EncryptedData> {
        let mut nonce_bytes = [0u8; 24];
        thread_rng().fill_bytes(&mut nonce_bytes);
        
        let ciphertext = self.cipher.encrypt(
            &Nonce::from_slice(&nonce_bytes), 
            password.as_bytes()
        )?;
        
        Ok(EncryptedData { nonce: nonce_bytes, ciphertext })
    }
}
```

### Zero-Knowledge Architecture
```javascript
// Circuit Circom pour preuve zero-knowledge
pragma circom 2.0.0;

template PasswordVerification() {
    signal private input password;
    signal private input salt;
    signal output hash;
    
    component hasher = Poseidon(2);
    hasher.inputs[0] <== password;
    hasher.inputs[1] <== salt;
    hash <== hasher.out;
}
```

### HSM Integration pour PCI DSS
```javascript
const hsm = require('nshield-hsm');

async function processPayment(cardData, amount) {
    // Chiffrement dans HSM
    const encryptedCard = await hsm.encrypt({
        data: cardData,
        keyIdentifier: 'payment-key-001'
    });
    
    // Génération cryptogramme
    const cryptogram = await hsm.generateCryptogram({
        pan: cardData.pan,
        amount: amount,
        timestamp: Date.now()
    });
    
    return { encryptedCard, cryptogram };
}
```

### Pipeline de sécurité automatisé
```yaml
# CI/CD security pipeline
jobs:
  security-scan:
    steps:
      - name: SAST
        run: semgrep --config=auto --json > sast-results.json
      
      - name: Dependency Check
        run: npm audit --json > dependency-check.json
      
      - name: DAST
        run: |
          docker run owasp/zap2docker-stable \
            zap-api-scan.py -t https://api.cloudity.com/openapi.json
      
      - name: Infrastructure Security
        run: |
          terraform plan -out=tfplan
          checkov -f tfplan --framework terraform
```