import React from 'react'
import {
  ResponsivePage,
  ResponsiveGrid,
  ResponsivePanel,
  ResponsiveToolbar,
  Card,
  CardHeader,
  Button,
  Input,
  Label,
  Badge,
  Spinner,
  EmptyState,
  IconButton,
  TableWrapper,
  TableHead,
  Th,
  TBody,
  Td,
} from '@cloudity/ui'
import { Settings } from 'lucide-react'

/** Catalogue visuel des primitives `@cloudity/ui` (admin uniquement). */
export default function UiCatalogPage() {
  return (
    <ResponsivePage
      title="Catalogue UI"
      description="Primitives @cloudity/ui — référence pour web et mobile ; personnalisation globale à brancher."
    >
      <Card className="p-4 border-dashed border-slate-300 dark:border-slate-600">
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          Roadmap : feature flags par composant (activer/désactiver variantes, densité, thème par app) persistés côté tenant
          — pour converger web + mobile sur une seule logique. Aujourd’hui : vitrine des composants ; les apps consomment{' '}
          <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">@cloudity/ui</code> directement.
        </p>
      </Card>
      <ResponsiveGrid>
        <ResponsivePanel title="Boutons">
          <ResponsiveToolbar>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <IconButton aria-label="Paramètres">
              <Settings className="w-4 h-4" />
            </IconButton>
            <Spinner />
          </ResponsiveToolbar>
        </ResponsivePanel>

        <ResponsivePanel title="Champs">
          <div className="space-y-3">
            <div>
              <Label htmlFor="ui-demo-input">Label</Label>
              <Input id="ui-demo-input" placeholder="Placeholder" />
            </div>
            <ResponsiveToolbar>
              <Badge>Default</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
            </ResponsiveToolbar>
          </div>
        </ResponsivePanel>

        <ResponsivePanel title="Table" className="lg:col-span-2">
          <TableWrapper>
            <TableHead>
              <Th>Colonne</Th>
              <Th>Statut</Th>
            </TableHead>
            <TBody>
              <tr>
                <Td>Exemple</Td>
                <Td>
                  <Badge variant="success">OK</Badge>
                </Td>
              </tr>
            </TBody>
          </TableWrapper>
        </ResponsivePanel>

        <ResponsivePanel title="États" className="lg:col-span-2">
          <EmptyState
            title="Aucun élément"
            description="État vide réutilisable dans les listes."
            action={<Button variant="secondary">Action</Button>}
          />
        </ResponsivePanel>
      </ResponsiveGrid>
    </ResponsivePage>
  )
}
