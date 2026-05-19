import React from 'react'
import {
  PageLayout,
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
    <PageLayout
      title="Catalogue UI"
      description="Primitives @cloudity/ui — usage interne back-office."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Boutons</h2>
          </CardHeader>
          <div className="p-4 flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <IconButton aria-label="Paramètres">
              <Settings className="w-4 h-4" />
            </IconButton>
            <Spinner />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Champs</h2>
          </CardHeader>
          <div className="p-4 space-y-3">
            <div>
              <Label htmlFor="ui-demo-input">Label</Label>
              <Input id="ui-demo-input" placeholder="Placeholder" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Table</h2>
          </CardHeader>
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
        </Card>

        <Card className="lg:col-span-2">
          <EmptyState
            title="Aucun élément"
            description="État vide réutilisable dans les listes."
            action={<Button variant="secondary">Action</Button>}
          />
        </Card>
      </div>
    </PageLayout>
  )
}
