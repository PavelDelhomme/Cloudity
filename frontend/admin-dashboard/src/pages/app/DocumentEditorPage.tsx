import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { ChevronRight, Save, Loader2, Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Heading3, AlignLeft, AlignCenter, AlignRight, AlignJustify, Strikethrough, Link as LinkIcon, Minus, Quote, Pilcrow, FileDown, X, Presentation, ChevronLeft, FolderOpen } from 'lucide-react'
import { parseCsvToGrid, gridToCsv } from '../../utils/csvGrid'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import {
  getDriveNodeContentAsText,
  putDriveNodeContent,
  putDriveNodeContentBlob,
  renameDriveNode,
  moveDriveNode,
  downloadDriveFile,
  fetchDriveNodes,
  type DriveNode,
} from '../../api'

const EDITABLE_EXT = ['.txt', '.md', '.html', '.csv', '.xlsx', '.doc', '.docx']
const RICH_EXT = ['.html', '.docx', '.doc']
const DOCX_EXT = '.docx'
const DOC_EXT = '.doc'

function getExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function isRich(name: string): boolean {
  return RICH_EXT.includes(getExtension(name))
}

function isDocx(name: string): boolean {
  return getExtension(name) === DOCX_EXT
}

/** Fichier Word (.doc ou .docx) ouvrable en éditeur après conversion en HTML. */
function isWordDocument(name: string): boolean {
  const ext = getExtension(name)
  return ext === DOCX_EXT || ext === DOC_EXT
}

function isPresentation(name: string): boolean {
  return /présentation|\.pptx?$/i.test(name)
}

function isSpreadsheet(name: string): boolean {
  const ext = getExtension(name)
  return ext === '.csv' || ext === '.xlsx'
}

/** Découpe le HTML en diapos (séparateurs <hr> ou blocs h1). */
function getSlidesFromHtml(html: string): string[] {
  if (!html?.trim()) return ['<p></p>']
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  const slides: string[] = []
  let current: string[] = []
  const flush = () => {
    if (current.length) {
      slides.push(current.join(''))
      current = []
    }
  }
  for (const node of body.childNodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      if (node.textContent?.trim()) current.push(node.textContent)
      continue
    }
    const el = node as Element
    if (el.tagName === 'HR') {
      flush()
      continue
    }
    if (el.tagName === 'H1' && current.length > 0) {
      flush()
    }
    current.push((el as Element).outerHTML)
  }
  flush()
  return slides.length ? slides : ['<p></p>']
}

export default function DocumentEditorPage() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const { accessToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [rich, setRich] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [formatState, setFormatState] = useState({ bold: false, italic: false, underline: false, strikeThrough: false, formatBlock: 'p' as string })
  const [gridRows, setGridRows] = useState<string[][]>([['']])
  const [showSlideView, setShowSlideView] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moving, setMoving] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const skipReloadAfterRenameRef = useRef(false)

  const id = nodeId ? parseInt(nodeId, 10) : NaN
  const validId = Number.isInteger(id) && id > 0

  const loadContent = useCallback(async () => {
    if (!validId || !accessToken) return
    setLoading(true)
    try {
      const text = await getDriveNodeContentAsText(accessToken, id)
      setContent(text)
      if (editorRef.current && rich) {
        editorRef.current.innerHTML = text || ''
      }
      if (textareaRef.current && !rich) {
        textareaRef.current.value = text || ''
      }
      if (name.toLowerCase().endsWith('.csv')) {
        setGridRows(parseCsvToGrid(text || ''))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossible de charger le fichier')
      navigate('/app/drive')
    } finally {
      setLoading(false)
    }
  }, [id, validId, accessToken, rich, name, navigate])

  const loadWordContent = useCallback(async () => {
    if (!validId || !accessToken) return
    setLoading(true)
    try {
      const blob = await downloadDriveFile(accessToken, id)
      const { wordBlobToHtml } = await import('../../utils/wordToHtml')
      const html = await wordBlobToHtml(blob)
      setContent(html)
      setRich(true)
      if (editorRef.current) editorRef.current.innerHTML = html || ''
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossible d\'ouvrir le document Word')
      navigate('/app/drive')
    } finally {
      setLoading(false)
    }
  }, [id, validId, accessToken, navigate])

  const loadXlsxContent = useCallback(async () => {
    if (!validId || !accessToken) return
    setLoading(true)
    try {
      const blob = await downloadDriveFile(accessToken, id)
      const { xlsxBlobToGrid } = await import('../../utils/exportOffice')
      const grid = await xlsxBlobToGrid(blob)
      setGridRows(grid)
      setRich(false)
      setContent('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossible d\'ouvrir le tableur')
      navigate('/app/drive')
    } finally {
      setLoading(false)
    }
  }, [id, validId, accessToken, navigate])

  useEffect(() => {
    if (!validId || !accessToken) {
      if (!validId) setLoading(false)
      return
    }
    let cancelled = false
    const walk = async (parentId: number | null): Promise<DriveNode | null> => {
      const list = await fetchDriveNodes(accessToken, parentId)
      for (const n of list) {
        if (n.id === id) return n
        if (n.is_folder) {
          const found = await walk(n.id)
          if (found) return found
        }
      }
      return null
    }
    walk(null).then((node) => {
      if (cancelled) return
      if (node) setName(node.name)
      else setLoading(false)
    }).catch(() => { setLoading(false) })
    return () => { cancelled = true }
  }, [id, validId, accessToken])

  useEffect(() => {
    if (!name || !validId || !accessToken) return
    if (skipReloadAfterRenameRef.current) {
      skipReloadAfterRenameRef.current = false
      return
    }
    if (isWordDocument(name)) {
      loadWordContent()
      return
    }
    if (name.toLowerCase().endsWith('.xlsx')) {
      loadXlsxContent()
      return
    }
    loadContent()
  }, [name, validId, accessToken, loadContent, loadWordContent, loadXlsxContent])

  useEffect(() => {
    if (name) setRich(isRich(name))
  }, [name])

  useEffect(() => {
    if (!rich || !editorRef.current) return
    editorRef.current.innerHTML = content || ''
  }, [rich])

  const updateFormatState = useCallback(() => {
    if (typeof document.queryCommandState !== 'function') return
    setFormatState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      formatBlock: (document.queryCommandValue('formatBlock') || 'p').toLowerCase(),
    })
  }, [])

  useEffect(() => {
    if (!rich || !editorRef.current) return
    const el = editorRef.current
    const onSelectionChange = () => {
      if (document.activeElement !== el) return
      updateFormatState()
    }
    el.addEventListener('focus', updateFormatState)
    el.addEventListener('blur', updateFormatState)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      el.removeEventListener('focus', updateFormatState)
      el.removeEventListener('blur', updateFormatState)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [rich, updateFormatState])

  const handleInput = useCallback(() => {
    if (rich && editorRef.current) {
      setContent(editorRef.current.innerHTML)
    } else if (textareaRef.current) {
      setContent(textareaRef.current.value)
    }
    setDirty(true)
  }, [rich])

  const execCommand = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    if (editorRef.current) setContent(editorRef.current.innerHTML)
    setDirty(true)
    editorRef.current?.focus()
    setTimeout(updateFormatState, 0)
  }

  const insertLink = () => {
    const url = window.prompt('URL du lien :', 'https://')
    if (url) execCommand('createLink', url)
  }

  const insertHorizontalRule = () => execCommand('insertHorizontalRule')

  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  const handleSave = useCallback(async () => {
    if (!validId || !accessToken) return
    setSaving(true)
    try {
      if (rich && editorRef.current) {
        const html = editorRef.current.innerHTML
        const { htmlToDocxBlob } = await import('../../utils/exportOffice')
        const blob = await htmlToDocxBlob(html)
        await putDriveNodeContentBlob(accessToken, id, blob, DOCX_MIME)
        const baseName = name ? name.replace(/\\.(html?|docx?)$/i, '') || 'document' : 'document'
        const newName = `${baseName}.docx`
        await renameDriveNode(accessToken, id, newName)
        skipReloadAfterRenameRef.current = true
        setName(newName)
      } else if (name.toLowerCase().endsWith('.xlsx')) {
        const { gridToXlsxBlob } = await import('../../utils/exportOffice')
        const blob = gridToXlsxBlob(gridRows)
        await putDriveNodeContentBlob(accessToken, id, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      } else {
        const toSave = name.toLowerCase().endsWith('.csv')
          ? gridToCsv(gridRows)
          : (textareaRef.current?.value ?? content)
        const mime = name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain'
        await putDriveNodeContent(accessToken, id, toSave, mime)
      }
      setDirty(false)
      toast.success(rich ? 'Enregistré en .docx' : 'Enregistré')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }, [validId, accessToken, id, content, rich, name, gridRows])

  const handleDownloadDocx = useCallback(async () => {
    if (!validId || !accessToken) return
    setExporting(true)
    try {
      const blob = await downloadDriveFile(accessToken, id)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name || 'document.docx'
      a.click()
      URL.revokeObjectURL(a.href)
      toast.success('Téléchargement démarré')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur téléchargement')
    } finally {
      setExporting(false)
    }
  }, [validId, accessToken, id, name])

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm('Modifications non enregistrées. Quitter quand même ?')) return
    navigate('/app/drive')
  }, [dirty, navigate])

  const handleMoveTo = useCallback(async (parentId: number | null) => {
    if (!validId || !accessToken) return
    setMoving(true)
    try {
      await moveDriveNode(accessToken, id, parentId)
      toast.success(parentId === null ? 'Déplacé à la racine du Drive' : 'Fichier déplacé')
      queryClient.invalidateQueries({ queryKey: ['drive'] })
      setShowMoveModal(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors du déplacement')
    } finally {
      setMoving(false)
    }
  }, [validId, accessToken, id, queryClient])

  const setGridCell = useCallback((ri: number, ci: number, value: string) => {
    setGridRows((prev) => {
      const next = prev.map((r) => [...r])
      while (next.length <= ri) next.push([])
      while (next[ri].length <= ci) next[ri].push('')
      next[ri][ci] = value
      return next
    })
    setDirty(true)
  }, [])
  useEffect(() => {
    if (!isSpreadsheet(name) || gridRows.length === 0) return
    setContent((prev) => {
      const next = gridToCsv(gridRows)
      return next === prev ? prev : next
    })
  }, [gridRows, name])

  const [slideContent, setSlideContent] = useState('')
  const openSlideView = useCallback(() => {
    setSlideContent(editorRef.current?.innerHTML ?? content)
    setSlideIndex(0)
    setShowSlideView(true)
  }, [content])
  const slides = slideContent ? getSlidesFromHtml(slideContent) : []
  const canSlideView = rich && isPresentation(name)

  const { data: rootNodes = [] } = useQuery({
    queryKey: ['drive', 'nodes', null],
    queryFn: () => fetchDriveNodes(accessToken!, null),
    enabled: showMoveModal && !!accessToken,
  })
  const rootFolders = rootNodes.filter((n) => n.is_folder)

  const handleExportXlsx = useCallback(async () => {
    const text = !rich && textareaRef.current ? textareaRef.current.value : content
    try {
      const { csvToXlsxDownload } = await import('../../utils/exportOffice')
      csvToXlsxDownload(text || '', name || 'tableur')
      toast.success('Export .xlsx téléchargé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur export .xlsx. Installez le paquet xlsx (npm install).')
    }
  }, [rich, content, name])

  // Sauvegarde automatique : .xlsx → blob ; documents (éditeur riche) → toujours .docx ; .csv/.md/.txt → texte
  useEffect(() => {
    if (!dirty || !validId || !accessToken) return
    const t = setInterval(() => {
      if (name.toLowerCase().endsWith('.xlsx')) {
        import('../../utils/exportOffice').then(({ gridToXlsxBlob }) => {
          const blob = gridToXlsxBlob(gridRows)
          putDriveNodeContentBlob(accessToken, id, blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .then(() => { setDirty(false); toast.success('Sauvegardé automatiquement') })
            .catch(() => {})
        })
        return
      }
      if (rich && editorRef.current) {
        // Documents (éditeur riche) : toujours enregistrer en .docx, jamais en .html/.txt
        import('../../utils/exportOffice').then(({ htmlToDocxBlob }) => {
          const html = editorRef.current!.innerHTML
          htmlToDocxBlob(html).then((blob) =>
            putDriveNodeContentBlob(accessToken, id, blob, DOCX_MIME)
          ).then(() => {
            const baseName = name ? name.replace(/\.(html?|docx?)$/i, '') || 'document' : 'document'
            const newName = `${baseName}.docx`
            return renameDriveNode(accessToken, id, newName).then(() => {
              skipReloadAfterRenameRef.current = true
              setName(newName)
              setDirty(false)
              toast.success('Sauvegardé automatiquement en .docx')
            })
          }).catch(() => {})
        })
        return
      }
      const toSave = name.toLowerCase().endsWith('.csv')
        ? gridToCsv(gridRows)
        : (textareaRef.current?.value ?? content)
      if (!toSave) return
      const mime = name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain'
      putDriveNodeContent(accessToken, id, toSave, mime)
        .then(() => { setDirty(false); toast.success('Sauvegardé automatiquement') })
        .catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [dirty, validId, accessToken, id, content, rich, name, gridRows])

  if (!validId) {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400">Identifiant de document invalide.</p>
        <Link to="/app/drive" className="text-brand-600 dark:text-brand-400 mt-2 inline-block">Retour au Drive</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3">
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link to="/app/drive" className="hover:text-slate-700 dark:hover:text-slate-300">Drive</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 dark:text-slate-100 font-medium truncate max-w-[180px]" title={name}>
            {name || 'Document'}
          </span>
        </nav>
        <div className="flex items-center gap-2">
          {rich && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/80 p-1.5">
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => execCommand('bold')} className={`p-2 rounded transition-colors ${formatState.bold ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Gras"><Bold className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('italic')} className={`p-2 rounded transition-colors ${formatState.italic ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Italique"><Italic className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('underline')} className={`p-2 rounded transition-colors ${formatState.underline ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Souligné"><Underline className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('strikeThrough')} className={`p-2 rounded transition-colors ${formatState.strikeThrough ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Barré"><Strikethrough className="h-4 w-4" /></button>
              </div>
              <span className="w-px h-5 bg-slate-300 dark:bg-slate-500" />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => execCommand('formatBlock', 'h1')} className={`p-2 rounded transition-colors ${formatState.formatBlock === 'h1' ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Titre 1"><Heading1 className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'h2')} className={`p-2 rounded transition-colors ${formatState.formatBlock === 'h2' ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Titre 2"><Heading2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'h3')} className={`p-2 rounded transition-colors ${formatState.formatBlock === 'h3' ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Titre 3"><Heading3 className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'p')} className={`p-2 rounded transition-colors ${formatState.formatBlock === 'p' ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Paragraphe"><Pilcrow className="h-4 w-4" /></button>
              </div>
              <span className="w-px h-5 bg-slate-300 dark:bg-slate-500" />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => execCommand('insertUnorderedList')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Liste à puces"><List className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('insertOrderedList')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Liste numérotée"><ListOrdered className="h-4 w-4" /></button>
              </div>
              <span className="w-px h-5 bg-slate-300 dark:bg-slate-500" />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => execCommand('justifyLeft')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Aligner à gauche"><AlignLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('justifyCenter')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Centrer"><AlignCenter className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('justifyRight')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Aligner à droite"><AlignRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('justifyFull')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Justifier"><AlignJustify className="h-4 w-4" /></button>
              </div>
              <span className="w-px h-5 bg-slate-300 dark:bg-slate-500" />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={insertLink} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Insérer un lien"><LinkIcon className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'blockquote')} className={`p-2 rounded transition-colors ${formatState.formatBlock === 'blockquote' ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Citation"><Quote className="h-4 w-4" /></button>
                <button type="button" onClick={insertHorizontalRule} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Ligne horizontale"><Minus className="h-4 w-4" /></button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => setShowMoveModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
            title="Déplacer vers un dossier du Drive"
          >
            <FolderOpen className="h-4 w-4" />
            Déplacer vers…
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600"
            title="Fermer et revenir au Drive"
          >
            <X className="h-5 w-5" />
          </button>
          {rich && isWordDocument(name) && (
            <button
              type="button"
              onClick={handleDownloadDocx}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
              title="Télécharger le document Word"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              Télécharger
            </button>
          )}
          {canSlideView && (
            <button
              type="button"
              onClick={openSlideView}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
              title="Afficher en mode présentation"
            >
              <Presentation className="h-4 w-4" />
              Vue diapos
            </button>
          )}
          {!rich && name.toLowerCase().endsWith('.csv') && (
            <button
              type="button"
              onClick={handleExportXlsx}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
              title="Télécharger en format Excel (.xlsx)"
            >
              <FileDown className="h-4 w-4" />
              Exporter .xlsx
            </button>
          )}
        </div>
      </div>

      {/* Modal Déplacer vers */}
      {showMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" aria-labelledby="move-modal-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600">
              <h2 id="move-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Enregistrer / Déplacer vers</h2>
              <button type="button" onClick={() => setShowMoveModal(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400">Choisissez un emplacement dans le Drive pour ce fichier.</p>
            <div className="flex-1 overflow-auto px-4 pb-4">
              <button
                type="button"
                onClick={() => handleMoveTo(null)}
                disabled={moving}
                className="flex items-center gap-3 w-full py-3 px-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left disabled:opacity-50"
              >
                <FolderOpen className="h-5 w-5 text-slate-500" />
                <span className="font-medium text-slate-900 dark:text-slate-100">Racine du Drive</span>
              </button>
              {rootFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => handleMoveTo(folder.id)}
                  disabled={moving}
                  className="flex items-center gap-3 w-full py-3 px-3 mt-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left disabled:opacity-50"
                >
                  <FolderOpen className="h-5 w-5 text-amber-500" />
                  <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{folder.name}</span>
                </button>
              ))}
              {rootFolders.length === 0 && (
                <p className="py-4 text-sm text-slate-500 dark:text-slate-400">Aucun dossier à la racine. Déplacez vers la racine ou créez un dossier depuis le Drive.</p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-600">
              <button type="button" onClick={() => setShowMoveModal(false)} className="w-full py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vue diapos (présentation type PowerPoint) */}
      {showSlideView && (
        <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col" role="dialog" aria-modal="true">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
            <button type="button" onClick={() => setShowSlideView(false)} className="text-slate-300 hover:text-white p-2 rounded">
              <X className="h-5 w-5" />
            </button>
            <span className="text-slate-400 text-sm">
              {slideIndex + 1} / {slides.length}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSlideIndex((i) => Math.max(0, i - 1))} className="p-2 rounded bg-slate-700 text-white hover:bg-slate-600" disabled={slideIndex === 0}>
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setSlideIndex((i) => Math.min(slides.length - 1, i + 1))} className="p-2 rounded bg-slate-700 text-white hover:bg-slate-600" disabled={slideIndex >= slides.length - 1}>
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            <div
              className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-12 max-w-4xl w-full min-h-[50vh] prose dark:prose-invert prose-headings:font-semibold prose-lg"
              dangerouslySetInnerHTML={{ __html: slides[slideIndex] ?? '<p></p>' }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 bg-slate-50 dark:bg-slate-900/50">
        {rich ? (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            className="min-h-[300px] max-w-3xl mx-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 prose dark:prose-invert prose-headings:font-semibold prose-blockquote:border-l-brand-500 prose-blockquote:italic prose-blockquote:pl-4 prose-hr:border-slate-200 dark:prose-hr:border-slate-600"
            data-placeholder="Saisissez votre texte…"
            style={{ outline: 'none' }}
          />
        ) : isSpreadsheet(name) ? (
          <div className="overflow-auto max-w-4xl mx-auto">
            <table className="border-collapse w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
              <tbody>
                {gridRows.map((row, ri) => (
                  <tr key={ri}>
                    {Array.from({ length: Math.max(row.length, 1) }).map((_, ci) => (
                      <td key={ci} className="border border-slate-200 dark:border-slate-600 p-0">
                        <input
                          type="text"
                          value={row[ci] ?? ''}
                          onChange={(e) => setGridCell(ri, ci, e.target.value)}
                          className="w-full min-w-[100px] px-2 py-1.5 bg-transparent text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => setGridRows((prev) => [...prev, Array(Math.max(1, ...prev.map((r) => r.length))).fill('')])}
              className="mt-2 text-sm text-brand-600 dark:text-brand-400 hover:underline"
            >
              + Ajouter une ligne
            </button>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            defaultValue={content}
            onInput={handleInput}
            className="min-h-[300px] w-full max-w-3xl mx-auto block rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 resize-y"
            placeholder="Saisissez votre texte…"
            spellCheck
          />
        )}
      </div>
    </div>
  )
}

export { EDITABLE_EXT, getExtension, isRich, isWordDocument }
