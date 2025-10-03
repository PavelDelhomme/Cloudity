import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { 
  Database, 
  Table, 
  Search, 
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  FileText,
  HardDrive,
  Activity
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import { toast } from 'sonner';

interface DatabaseInfo {
  database: string;
  size: string;
  tables: TableInfo[];
  total_tables: number;
}

interface TableInfo {
  name: string;
  type: string;
  rows: number;
  size: string;
}

interface QueryResult {
  query: string;
  results: any[];
  count: number;
}

const DatabaseManager: React.FC = () => {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [query, setQuery] = useState('SELECT * FROM users LIMIT 10;');
  const [loading, setLoading] = useState(true);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDatabaseInfo = async () => {
    try {
      setLoading(true);
      const response = await adminService.getDatabases();
      setDbInfo(response.data);
      setError(null);
    } catch (err) {
      setError('Erreur lors du chargement des informations de la base de données');
      console.error('Error fetching database info:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeQuery = async () => {
    if (!query.trim()) return;
    
    try {
      setQueryLoading(true);
      const response = await adminService.executeQuery(query);
      setQueryResult(response.data);
    } catch (err: any) {
      console.error('Error executing query:', err);
      toast.error(`Erreur lors de l'exécution de la requête: ${err.response?.data?.detail || err.message}`);
    } finally {
      setQueryLoading(false);
    }
  };

  const backupTable = async (tableName: string) => {
    try {
      const response = await adminService.backupDatabase(tableName);
      if (response.data.success) {
        toast.success(`Table ${tableName} sauvegardée avec succès`);
      }
    } catch (err: any) {
      console.error('Error backing up table:', err);
      toast.error(`Erreur lors de la sauvegarde: ${err.response?.data?.detail || err.message}`);
    }
  };

  const formatTableData = (data: any[]) => {
    if (!data || data.length === 0) return [];
    
    const columns = Object.keys(data[0]);
    return data.map(row => ({
      ...row,
      _formatted: columns.reduce((acc, col) => {
        const value = row[col];
        if (value === null) return { ...acc, [col]: 'NULL' };
        if (typeof value === 'object') return { ...acc, [col]: JSON.stringify(value) };
        return { ...acc, [col]: String(value) };
      }, {})
    }));
  };

  useEffect(() => {
    fetchDatabaseInfo();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Chargement des informations de la base de données...</span>
      </div>
    );
  }

  if (error || !dbInfo) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error || 'Impossible de charger les informations de la base de données'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestionnaire de base de données</h1>
          <p className="text-muted-foreground">{dbInfo.database} - {dbInfo.size}</p>
        </div>
        <Button
          variant="outline"
          onClick={fetchDatabaseInfo}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      {/* Database Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Base de données</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Database className="h-4 w-4" />
              <span className="text-2xl font-bold">{dbInfo.database}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Table className="h-4 w-4" />
              <span className="text-2xl font-bold">{dbInfo.total_tables}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taille</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <HardDrive className="h-4 w-4" />
              <span className="text-2xl font-bold">{dbInfo.size}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tables" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="query">Requêtes SQL</TabsTrigger>
        </TabsList>

        <TabsContent value="tables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Table className="h-5 w-5 mr-2" />
                Tables de la base de données
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dbInfo.tables.map((table) => (
                  <div
                    key={table.name}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Table className="h-4 w-4" />
                        <span className="font-medium">{table.name}</span>
                      </div>
                      <Badge variant="outline">{table.type}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {table.rows.toLocaleString()} lignes
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {table.size}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setQuery(`SELECT * FROM ${table.name} LIMIT 10;`)}
                      >
                        <Search className="h-3 w-3 mr-1" />
                        Requête
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => backupTable(table.name)}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Sauvegarder
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="query" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Requêtes SQL (lecture seule)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Requête SQL</label>
                <Textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Entrez votre requête SELECT ici..."
                  className="min-h-[100px] font-mono"
                />
                <div className="flex items-center space-x-2">
                  <Button
                    onClick={executeQuery}
                    disabled={queryLoading || !query.trim()}
                  >
                    {queryLoading ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4 mr-2" />
                    )}
                    Exécuter
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Seules les requêtes SELECT sont autorisées
                  </span>
                </div>
              </div>

              {queryResult && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Résultats</h3>
                    <Badge variant="outline">
                      {queryResult.count} ligne{queryResult.count > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            {queryResult.results.length > 0 && Object.keys(queryResult.results[0]).map((column) => (
                              <th key={column} className="px-4 py-2 text-left font-medium">
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.results.slice(0, 100).map((row, index) => (
                            <tr key={index} className="border-t">
                              {Object.values(row).map((value, colIndex) => (
                                <td key={colIndex} className="px-4 py-2">
                                  <span className="font-mono text-xs">
                                    {value === null ? 'NULL' : String(value)}
                                  </span>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {queryResult.results.length > 100 && (
                      <div className="px-4 py-2 bg-muted text-sm text-muted-foreground">
                        Affichage des 100 premières lignes sur {queryResult.results.length} au total
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DatabaseManager;
