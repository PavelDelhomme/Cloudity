<!-- frontend/email-app/src/App.vue - Application Email paul@delhomme.ovh -->
<template>
  <div id="app" class="email-app">
    <!-- Login Screen si pas connecté -->
    <div v-if="!isAuthenticated" class="login-container">
      <div class="login-form">
        <div class="logo">
          <h1>📧 Cloudity Mail</h1>
          <p>paul@delhomme.ovh</p>
        </div>
        
        <form @submit.prevent="handleLogin" class="form">
          <div class="input-group">
            <label>Email</label>
            <input 
              v-model="loginForm.email" 
              type="email" 
              placeholder="paul@delhomme.ovh"
              required
            />
          </div>
          
          <div class="input-group">
            <label>Mot de passe Email</label>
            <input 
              v-model="loginForm.password" 
              type="password" 
              placeholder="Mot de passe de votre compte email"
              required
            />
          </div>
          
          <div class="server-config" v-if="showAdvanced">
            <h3>Configuration Serveur</h3>
            <div class="input-group">
              <label>Serveur SMTP</label>
              <input v-model="loginForm.smtpServer" placeholder="mail.delhomme.ovh" />
            </div>
            <div class="input-group">
              <label>Port SMTP</label>
              <input v-model="loginForm.smtpPort" type="number" placeholder="587" />
            </div>
            <div class="input-group">
              <label>Serveur IMAP</label>
              <input v-model="loginForm.imapServer" placeholder="mail.delhomme.ovh" />
            </div>
            <div class="input-group">
              <label>Port IMAP</label>
              <input v-model="loginForm.imapPort" type="number" placeholder="993" />
            </div>
          </div>
          
          <div class="form-actions">
            <button type="button" @click="showAdvanced = !showAdvanced" class="btn-secondary">
              {{ showAdvanced ? 'Masquer' : 'Configuration avancée' }}
            </button>
            <button type="submit" :disabled="isLoading" class="btn-primary">
              {{ isLoading ? 'Connexion...' : 'Se connecter' }}
            </button>
          </div>
        </form>
        
        <div v-if="error" class="error">
          {{ error }}
        </div>
      </div>
    </div>

    <!-- Interface Email si connecté -->
    <div v-else class="email-interface">
      <!-- Header -->
      <header class="email-header">
        <div class="header-left">
          <h1>📧 Cloudity Mail</h1>
          <span class="user-email">{{ currentUser.email }}</span>
        </div>
        <div class="header-right">
          <button @click="refreshEmails" class="btn-icon">🔄</button>
          <button @click="composeEmail" class="btn-primary">✍️ Nouveau</button>
          <button @click="logout" class="btn-secondary">Déconnexion</button>
        </div>
      </header>

      <div class="email-content">
        <!-- Sidebar -->
        <aside class="email-sidebar">
          <nav class="folders">
            <div 
              v-for="folder in folders" 
              :key="folder.name"
              @click="selectFolder(folder.name)"
              :class="['folder-item', { active: currentFolder === folder.name }]"
            >
              <span class="folder-icon">{{ folder.icon }}</span>
              <span class="folder-name">{{ folder.name }}</span>
              <span v-if="folder.count > 0" class="folder-count">{{ folder.count }}</span>
            </div>
          </nav>

          <!-- Alias Management -->
          <div class="alias-section">
            <h3>🏷️ Alias paul@delhomme.ovh</h3>
            <div class="alias-list">
              <div v-for="alias in aliases" :key="alias.alias" class="alias-item">
                <div class="alias-email">{{ alias.alias }}</div>
                <div class="alias-target">→ {{ alias.target_email }}</div>
              </div>
            </div>
            <button @click="showAliasForm = !showAliasForm" class="btn-small">
              + Nouvel alias
            </button>
            
            <!-- Formulaire création alias -->
            <div v-if="showAliasForm" class="alias-form">
              <input 
                v-model="newAlias.prefix" 
                placeholder="github"
                @input="updateAliasPreview"
              />
              <div class="alias-preview">{{ aliasPreview }}</div>
              <button @click="createAlias" class="btn-primary">Créer</button>
            </div>
          </div>
        </aside>

        <!-- Email List -->
        <main class="email-main">
          <div class="email-list-header">
            <h2>{{ currentFolder }}</h2>
            <div class="email-actions">
              <button @click="selectAll" class="btn-small">Tout sélectionner</button>
              <button @click="deleteSelected" class="btn-small">Supprimer</button>
            </div>
          </div>

          <div class="email-list">
            <div 
              v-for="email in filteredEmails" 
              :key="email.id"
              @click="selectEmail(email)"
              :class="['email-item', { 
                selected: selectedEmail?.id === email.id,
                unread: !email.is_read 
              }]"
            >
              <div class="email-checkbox">
                <input type="checkbox" v-model="email.selected" />
              </div>
              <div class="email-from">{{ email.from_addr }}</div>
              <div class="email-subject">{{ email.subject }}</div>
              <div class="email-date">{{ formatDate(email.created_at) }}</div>
            </div>
          </div>
        </main>

        <!-- Email Detail -->
        <aside v-if="selectedEmail" class="email-detail">
          <div class="email-detail-header">
            <h3>{{ selectedEmail.subject }}</h3>
            <div class="email-meta">
              <div><strong>De:</strong> {{ selectedEmail.from_addr }}</div>
              <div><strong>À:</strong> {{ selectedEmail.to_addr }}</div>
              <div><strong>Date:</strong> {{ formatDate(selectedEmail.created_at) }}</div>
            </div>
          </div>
          
          <div class="email-detail-content">
            <div v-if="selectedEmail.html_body" v-html="selectedEmail.html_body"></div>
            <div v-else class="email-text">{{ selectedEmail.body }}</div>
          </div>
          
          <div class="email-detail-actions">
            <button @click="replyToEmail" class="btn-primary">Répondre</button>
            <button @click="forwardEmail" class="btn-secondary">Transférer</button>
            <button @click="deleteEmail" class="btn-danger">Supprimer</button>
          </div>
        </aside>
      </div>
    </div>

    <!-- Modal Compose Email -->
    <div v-if="showCompose" class="modal-overlay" @click="closeCompose">
      <div class="compose-modal" @click.stop>
        <div class="compose-header">
          <h3>✍️ Nouveau message</h3>
          <button @click="closeCompose" class="btn-close">✕</button>
        </div>
        
        <form @submit.prevent="sendEmail" class="compose-form">
          <div class="input-group">
            <label>À</label>
            <input v-model="composeForm.to" type="email" required />
          </div>
          <div class="input-group">
            <label>Sujet</label>
            <input v-model="composeForm.subject" required />
          </div>
          <div class="input-group">
            <label>Message</label>
            <textarea v-model="composeForm.body" rows="10" required></textarea>
          </div>
          
          <div class="compose-actions">
            <button type="button" @click="closeCompose" class="btn-secondary">Annuler</button>
            <button type="submit" :disabled="isSending" class="btn-primary">
              {{ isSending ? 'Envoi...' : 'Envoyer' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue'
import axios from 'axios'

export default {
  name: 'App',
  setup() {
    // État authentification
    const isAuthenticated = ref(false)
    const currentUser = ref({})
    const error = ref('')
    const isLoading = ref(false)

    // Formulaire de connexion
    const loginForm = reactive({
      email: 'paul@delhomme.ovh',
      password: '',
      smtpServer: 'mail.delhomme.ovh',
      smtpPort: 587,
      imapServer: 'mail.delhomme.ovh',
      imapPort: 993
    })

    const showAdvanced = ref(false)

    // État emails
    const emails = ref([])
    const selectedEmail = ref(null)
    const currentFolder = ref('Boîte de réception')
    
    const folders = ref([
      { name: 'Boîte de réception', icon: '📥', count: 0 },
      { name: 'Envoyés', icon: '📤', count: 0 },
      { name: 'Brouillons', icon: '📝', count: 0 },
      { name: 'Spam', icon: '🚫', count: 0 },
      { name: 'Corbeille', icon: '🗑️', count: 0 }
    ])

    // État alias
    const aliases = ref([])
    const showAliasForm = ref(false)
    const newAlias = reactive({
      prefix: ''
    })

    const aliasPreview = computed(() => 
      newAlias.prefix ? `paul+${newAlias.prefix}@delhomme.ovh` : 'paul+exemple@delhomme.ovh'
    )

    // État composition
    const showCompose = ref(false)
    const isSending = ref(false)
    const composeForm = reactive({
      to: '',
      subject: '',
      body: ''
    })

    // API Configuration - Tout passe par l'API Gateway
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

    // Authentification
    const handleLogin = async () => {
      isLoading.value = true
      error.value = ''
      
      try {
        // Connexion via auth service
        const authResponse = await axios.post(`${API_BASE}/api/v1/auth/login`, {
          email: loginForm.email,
          password: loginForm.password
        })
        
        if (authResponse.data.token) {
          // Configuration axios avec token
          axios.defaults.headers.common['Authorization'] = `Bearer ${authResponse.data.token}`
          
          currentUser.value = {
            email: loginForm.email,
            token: authResponse.data.token
          }
          
          isAuthenticated.value = true
          
          // Charger les emails et alias
          await Promise.all([
            loadEmails(),
            loadAliases()
          ])
        }
      } catch (err) {
        error.value = 'Erreur de connexion: ' + (err.response?.data?.message || err.message)
      } finally {
        isLoading.value = false
      }
    }

    const logout = () => {
      isAuthenticated.value = false
      currentUser.value = {}
      emails.value = []
      aliases.value = []
      delete axios.defaults.headers.common['Authorization']
    }

    // Gestion emails
    const loadEmails = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/v1/emails`)
        emails.value = response.data.map(email => ({
          ...email,
          selected: false
        }))
        updateFolderCounts()
      } catch (err) {
        console.error('Erreur chargement emails:', err)
      }
    }

    const filteredEmails = computed(() => {
      return emails.value.filter(email => {
        switch (currentFolder.value) {
          case 'Boîte de réception':
            return email.folder === 'inbox'
          case 'Envoyés':
            return email.folder === 'sent'
          case 'Brouillons':
            return email.folder === 'drafts'
          case 'Spam':
            return email.folder === 'spam'
          case 'Corbeille':
            return email.folder === 'trash'
          default:
            return email.folder === 'inbox'
        }
      })
    })

    const selectFolder = (folderName) => {
      currentFolder.value = folderName
      selectedEmail.value = null
    }

    const selectEmail = (email) => {
      selectedEmail.value = email
      if (!email.is_read) {
        // Marquer comme lu
        email.is_read = true
        // TODO: API call pour marquer comme lu
      }
    }

    const updateFolderCounts = () => {
      folders.value.forEach(folder => {
        folder.count = emails.value.filter(email => {
          switch (folder.name) {
            case 'Boîte de réception':
              return email.folder === 'inbox' && !email.is_read
            case 'Envoyés':
              return email.folder === 'sent'
            case 'Brouillons':
              return email.folder === 'drafts'
            case 'Spam':
              return email.folder === 'spam'
            case 'Corbeille':
              return email.folder === 'trash'
            default:
              return false
          }
        }).length
      })
    }

    // Gestion alias
    const loadAliases = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/v1/aliases`)
        aliases.value = response.data
      } catch (err) {
        console.error('Erreur chargement alias:', err)
      }
    }

    const createAlias = async () => {
      if (!newAlias.prefix) return
      
      try {
        const aliasEmail = `paul+${newAlias.prefix}@delhomme.ovh`
        const response = await axios.post(`${API_BASE}/api/v1/aliases`, {
          alias: aliasEmail,
          target_email: 'paul@delhomme.ovh',
          is_active: true
        })
        
        aliases.value.push(response.data)
        newAlias.prefix = ''
        showAliasForm.value = false
      } catch (err) {
        console.error('Erreur création alias:', err)
      }
    }

    const updateAliasPreview = () => {
      // Reactive computed gère déjà cela
    }

    // Composition emails
    const composeEmail = () => {
      showCompose.value = true
      composeForm.to = ''
      composeForm.subject = ''
      composeForm.body = ''
    }

    const closeCompose = () => {
      showCompose.value = false
    }

    const sendEmail = async () => {
      isSending.value = true
      
      try {
        await axios.post(`${API_BASE}/api/v1/emails`, {
          from_addr: currentUser.value.email,
          to_addr: composeForm.to,
          subject: composeForm.subject,
          body: composeForm.body,
          folder: 'sent'
        })
        
        closeCompose()
        await loadEmails()
      } catch (err) {
        console.error('Erreur envoi email:', err)
        error.value = 'Erreur envoi email'
      } finally {
        isSending.value = false
      }
    }

    // Actions emails
    const refreshEmails = () => {
      loadEmails()
    }

    const selectAll = () => {
      const allSelected = filteredEmails.value.every(email => email.selected)
      filteredEmails.value.forEach(email => {
        email.selected = !allSelected
      })
    }

    const deleteSelected = () => {
      const selectedIds = emails.value.filter(email => email.selected).map(email => email.id)
      // TODO: API calls pour supprimer
      emails.value = emails.value.filter(email => !email.selected)
      updateFolderCounts()
    }

    const replyToEmail = () => {
      if (!selectedEmail.value) return
      composeForm.to = selectedEmail.value.from_addr
      composeForm.subject = `Re: ${selectedEmail.value.subject}`
      composeForm.body = `\n\n--- Message original ---\n${selectedEmail.value.body}`
      showCompose.value = true
    }

    const forwardEmail = () => {
      if (!selectedEmail.value) return
      composeForm.to = ''
      composeForm.subject = `Fwd: ${selectedEmail.value.subject}`
      composeForm.body = `\n\n--- Message transféré ---\nDe: ${selectedEmail.value.from_addr}\nSujet: ${selectedEmail.value.subject}\n\n${selectedEmail.value.body}`
      showCompose.value = true
    }

    const deleteEmail = () => {
      if (!selectedEmail.value) return
      // TODO: API call pour supprimer
      emails.value = emails.value.filter(email => email.id !== selectedEmail.value.id)
      selectedEmail.value = null
      updateFolderCounts()
    }

    // Utilitaires
    const formatDate = (dateString) => {
      const date = new Date(dateString)
      return date.toLocaleString('fr-FR')
    }

    // Initialisation
    onMounted(() => {
      // Vérifier si déjà connecté (token en localStorage)
      const savedToken = localStorage.getItem('cloudity_token')
      if (savedToken) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`
        currentUser.value = {
          email: localStorage.getItem('cloudity_email') || 'paul@delhomme.ovh',
          token: savedToken
        }
        isAuthenticated.value = true
        loadEmails()
        loadAliases()
      }
    })

    return {
      // État
      isAuthenticated,
      currentUser,
      error,
      isLoading,
      
      // Login
      loginForm,
      showAdvanced,
      handleLogin,
      logout,
      
      // Emails
      emails,
      selectedEmail,
      currentFolder,
      folders,
      filteredEmails,
      
      // Navigation
      selectFolder,
      selectEmail,
      
      // Alias
      aliases,
      showAliasForm,
      newAlias,
      aliasPreview,
      createAlias,
      updateAliasPreview,
      
      // Composition
      showCompose,
      isSending,
      composeForm,
      composeEmail,
      closeCompose,
      sendEmail,
      
      // Actions
      refreshEmails,
      selectAll,
      deleteSelected,
      replyToEmail,
      forwardEmail,
      deleteEmail,
      
      // Utilitaires
      formatDate
    }
  }
}
</script>

<style scoped>
.email-app {
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Login Styles */
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-form {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
}

.logo {
  text-align: center;
  margin-bottom: 2rem;
}

.logo h1 {
  margin: 0 0 0.5rem 0;
  color: #333;
}

.logo p {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
}

.input-group {
  margin-bottom: 1rem;
}

.input-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.input-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.server-config {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.server-config h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
}

.form-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.btn-primary, .btn-secondary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.btn-primary {
  background: #667eea;
  color: white;
  flex: 1;
}

.btn-secondary {
  background: #f8f9fa;
  color: #333;
  border: 1px solid #ddd;
}

.error {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #fee;
  color: #c53030;
  border-radius: 4px;
  border: 1px solid #fed7d7;
}

/* Email Interface */
.email-interface {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.email-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
}

.header-left h1 {
  margin: 0 1rem 0 0;
  font-size: 1.5rem;
}

.user-email {
  color: #666;
  font-size: 0.9rem;
}

.header-right {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.btn-icon {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
}

.email-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.email-sidebar {
  width: 250px;
  background: #f8f9fa;
  border-right: 1px solid #dee2e6;
  padding: 1rem;
  overflow-y: auto;
}

.folders {
  margin-bottom: 2rem;
}

.folder-item {
  display: flex;
  align-items: center;
  padding: 0.75rem;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 0.25rem;
}

.folder-item:hover {
  background: #e9ecef;
}

.folder-item.active {
  background: #667eea;
  color: white;
}

.folder-icon {
  margin-right: 0.75rem;
}

.folder-name {
  flex: 1;
}

.folder-count {
  background: #dc3545;
  color: white;
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
  border-radius: 12px;
  min-width: 20px;
  text-align: center;
}

.alias-section {
  border-top: 1px solid #dee2e6;
  padding-top: 1rem;
}

.alias-section h3 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
}

.alias-item {
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
}

.alias-email {
  font-weight: 500;
}

.alias-target {
  color: #666;
}

.alias-form {
  margin-top: 1rem;
}

.alias-form input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.alias-preview {
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.btn-small {
  background: #667eea;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.email-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.email-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid #dee2e6;
}

.email-list-header h2 {
  margin: 0;
}

.email-actions {
  display: flex;
  gap: 0.5rem;
}

.email-list {
  flex: 1;
  overflow-y: auto;
}

.email-item {
  display: flex;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid #f1f3f4;
  cursor: pointer;
}

.email-item:hover {
  background: #f8f9fa;
}

.email-item.selected {
  background: #e3f2fd;
}

.email-item.unread {
  font-weight: 600;
}

.email-checkbox {
  margin-right: 1rem;
}

.email-from {
  width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.email-subject {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0 1rem;
}

.email-date {
  width: 120px;
  text-align: right;
  color: #666;
  font-size: 0.9rem;
}

.email-detail {
  width: 400px;
  border-left: 1px solid #dee2e6;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.email-detail-header {
  padding: 2rem;
  border-bottom: 1px solid #dee2e6;
}

.email-detail-header h3 {
  margin: 0 0 1rem 0;
}

.email-meta div {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.email-detail-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

.email-text {
  white-space: pre-wrap;
  line-height: 1.6;
}

.email-detail-actions {
  padding: 1rem 2rem;
  border-top: 1px solid #dee2e6;
  display: flex;
  gap: 1rem;
}

.btn-danger {
  background: #dc3545;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

/* Modal Compose */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.compose-modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.compose-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid #dee2e6;
}

.compose-header h3 {
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
}

.compose-form {
  padding: 2rem;
  flex: 1;
  overflow-y: auto;
}

.compose-form textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
  font-family: inherit;
  resize: vertical;
}

.compose-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
  justify-content: flex-end;
}
</style>