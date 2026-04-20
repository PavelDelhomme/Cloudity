import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { ChevronRight, Save, Loader2, Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, AlignLeft, AlignCenter, AlignRight, AlignJustify, Strikethrough, Link as LinkIcon, Minus, Quote, Pilcrow, FileDown, X, Presentation, ChevronLeft, FolderOpen, FileCode2, Edit2, Trash2, FileText, Edit3, Eye, ImagePlus, Type, Table, ChevronDown, Scissors, Copy, ClipboardPaste, MousePointer, Printer, ZoomIn, ZoomOut, Maximize2, Ruler, Highlighter } from 'lucide-react'
import { parseCsvToGrid, gridToCsv } from '../../utils/csvGrid'
import { htmlToMarkdown, markdownToHtml } from '../../utils/htmlMarkdown'
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
  deleteDriveNode,
  type DriveNode,
} from '../../api'

const EDITABLE_EXT = ['.txt', '.md', '.html', '.csv', '.xlsx', '.doc', '.docx']

/** Formats éditables + voisins ouvrables dans l’éditeur (aperçu Drive possible en iframe). */
const OFFICE_IFRAME_PREVIEW_EXTRA_EXT = ['.htm', '.ppt', '.pptx', '.rtf', '.xls', '.xlsm'] as const

const RICH_EXT = ['.html', '.docx', '.doc']
const DOCX_EXT = '.docx'
const DOC_EXT = '.doc'

function getExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

/** Nom de fichier ouvrable dans l’éditeur / affichable en aperçu intégré Drive (iframe). */
export function isOfficeIframePreviewName(name: string): boolean {
  if (/présentation|\.pptx?$/i.test(name)) return true
  const ext = getExtension(name)
  if (EDITABLE_EXT.includes(ext)) return true
  return (OFFICE_IFRAME_PREVIEW_EXTRA_EXT as readonly string[]).includes(ext)
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

/** Étend la sélection au mot courant si le curseur est sur un mot (sans sélection). Utilisé pour gras/italique/souligné/barré. */
function expandSelectionToWord(sel: Selection): void {
  if (sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return
  const startNode = range.startContainer
  const startOffset = range.startOffset
  if (startNode.nodeType !== Node.TEXT_NODE) return
  const text = startNode.textContent ?? ''
  const wordBoundary = /[\s\u00A0]/
  let start = startOffset
  let end = startOffset
  while (start > 0 && !wordBoundary.test(text[start - 1]!)) start--
  while (end < text.length && !wordBoundary.test(text[end]!)) end++
  if (start === end) return
  range.setStart(startNode, start)
  range.setEnd(startNode, end)
  sel.removeAllRanges()
  sel.addRange(range)
}

type EditorLocationState = { from?: 'drive' | 'office'; parentId?: number | null; breadcrumb?: { id: number | null; name: string }[] }

export default function DocumentEditorPage() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { accessToken } = useAuth()
  const editorState = (location.state as EditorLocationState | null | undefined)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  const loadingRef = useRef(loading)
  const [rich, setRich] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [formatState, setFormatState] = useState({ bold: false, italic: false, underline: false, strikeThrough: false, formatBlock: 'p' as string })
  const [gridRows, setGridRows] = useState<string[][]>([['']])
  const [showSlideView, setShowSlideView] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moving, setMoving] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkUrl, setLinkUrl] = useState('https://')
  const [showTableModal, setShowTableModal] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [showQuitConfirmModal, setShowQuitConfirmModal] = useState(false)
  const [markdownMode, setMarkdownMode] = useState(false)
  const [markdownSource, setMarkdownSource] = useState('')
  const [openMenu, setOpenMenu] = useState<'fichier' | 'edition' | 'affichage' | 'insertion' | 'format' | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  /** Dernière sélection dans l’éditeur riche : restaurée avant execCommand quand le menu a volé le focus. */
  const savedEditorRangeRef = useRef<Range | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const skipReloadAfterRenameRef = useRef(false)
  const wasLoadingRef = useRef(loading)
  /** Incrémenté à chaque chargement Drive : une réponse async obsolète ne doit pas réécraser l’éditeur (saisie / autre requête). */
  const driveContentLoadGenRef = useRef(0)

  const id = nodeId ? parseInt(nodeId, 10) : NaN
  const validId = Number.isInteger(id) && id > 0

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  const loadContent = useCallback(async () => {
    if (!validId || !accessToken) return
    const gen = ++driveContentLoadGenRef.current
    const silentRefresh = loadingRef.current === false && dirtyRef.current
    if (!silentRefresh) setLoading(true)
    try {
      const text = await getDriveNodeContentAsText(accessToken, id)
      if (gen !== driveContentLoadGenRef.current) return
      if (dirtyRef.current) return
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
      if (gen !== driveContentLoadGenRef.current) return
      toast.error(e instanceof Error ? e.message : 'Impossible de charger le fichier')
      navigate('/app/drive')
    } finally {
      if (gen === driveContentLoadGenRef.current) setLoading(false)
    }
  }, [id, validId, accessToken, rich, name, navigate])

  const loadWordContent = useCallback(async () => {
    if (!validId || !accessToken) return
    const gen = ++driveContentLoadGenRef.current
    const silentRefresh = loadingRef.current === false && dirtyRef.current
    if (!silentRefresh) setLoading(true)
    try {
      const blob = await downloadDriveFile(accessToken, id)
      if (gen !== driveContentLoadGenRef.current) return
      const { wordBlobToHtml } = await import('../../utils/wordToHtml')
      const html = await wordBlobToHtml(blob)
      if (gen !== driveContentLoadGenRef.current) return
      if (dirtyRef.current) return
      setContent(html)
      setRich(true)
      if (editorRef.current) editorRef.current.innerHTML = html || ''
    } catch (e) {
      if (gen !== driveContentLoadGenRef.current) return
      toast.error(e instanceof Error ? e.message : 'Impossible d\'ouvrir le document Word')
      navigate('/app/drive')
    } finally {
      if (gen === driveContentLoadGenRef.current) setLoading(false)
    }
  }, [id, validId, accessToken, navigate])

  const loadXlsxContent = useCallback(async () => {
    if (!validId || !accessToken) return
    const gen = ++driveContentLoadGenRef.current
    setLoading(true)
    try {
      const blob = await downloadDriveFile(accessToken, id)
      if (gen !== driveContentLoadGenRef.current) return
      const { xlsxBlobToGrid } = await import('../../utils/exportOffice')
      const grid = await xlsxBlobToGrid(blob)
      if (gen !== driveContentLoadGenRef.current) return
      setGridRows(grid)
      setRich(false)
      setContent('')
    } catch (e) {
      if (gen !== driveContentLoadGenRef.current) return
      toast.error(e instanceof Error ? e.message : 'Impossible d\'ouvrir le tableur')
      navigate('/app/drive')
    } finally {
      if (gen === driveContentLoadGenRef.current) setLoading(false)
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

  /** Pendant le chargement le spinner masque l’éditeur : loadContent ne peut pas remplir editorRef. On hydrate ici à la fin du chargement. */
  useEffect(() => {
    const prev = wasLoadingRef.current
    wasLoadingRef.current = loading
    if (!prev || loading) return
    if (markdownMode) return
    if (rich && editorRef.current) {
      editorRef.current.innerHTML = content || ''
    } else if (!rich && textareaRef.current && !isSpreadsheet(name)) {
      textareaRef.current.value = content || ''
    }
  }, [loading, rich, markdownMode, content, name])

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

  useEffect(() => {
    if (!rich) {
      savedEditorRangeRef.current = null
      return
    }
    const onSelectionChange = () => {
      if (!editorRef.current) return
      const sel = document.getSelection()
      if (!sel || sel.rangeCount === 0) return
      let range: Range
      try {
        range = sel.getRangeAt(0)
      } catch {
        return
      }
      if (!editorRef.current.contains(range.commonAncestorContainer)) return
      try {
        savedEditorRangeRef.current = range.cloneRange()
      } catch {
        /* ignore */
      }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [rich])

  const handleInput = useCallback(() => {
    dirtyRef.current = true
    if (rich && editorRef.current) {
      setContent(editorRef.current.innerHTML)
    } else if (textareaRef.current) {
      setContent(textareaRef.current.value)
    }
    setDirty(true)
  }, [rich])

  const execCommand = (cmd: string, value?: string) => {
    const ed = editorRef.current
    const saved = savedEditorRangeRef.current
    let formatBlockStartNode: Node | null = null
    if (cmd === 'formatBlock' && value && ed && saved) {
      try {
        if (ed.contains(saved.startContainer)) formatBlockStartNode = saved.startContainer
      } catch {
        /* ignore */
      }
    }
    if (ed && saved) {
      try {
        if (ed.contains(saved.startContainer)) {
          const selection = document.getSelection()
          if (selection) {
            ed.focus()
            selection.removeAllRanges()
            selection.addRange(saved)
          }
        }
      } catch {
        savedEditorRangeRef.current = null
      }
    }
    const sel = document.getSelection()
    const isInlineFormat = ['bold', 'italic', 'underline', 'strikeThrough'].includes(cmd)
    if (isInlineFormat && sel && sel.rangeCount > 0 && editorRef.current) {
      const range = sel.getRangeAt(0)
      if (editorRef.current.contains(range.commonAncestorContainer) && sel.isCollapsed) {
        expandSelectionToWord(sel)
        // Si après expansion il n’y a toujours pas de sélection (ligne vide, curseur hors mot), ne pas appliquer au bloc entier
        if (sel.rangeCount > 0 && sel.getRangeAt(0).collapsed) return
      }
    }
    document.execCommand(cmd, false, value)
    /* formatBlock « h1 » etc. échoue parfois (focus menu, Chromium) : forcer le bloc courant. */
    if (cmd === 'formatBlock' && value && /^h[1-6]|p$/i.test(value) && editorRef.current) {
      const root = editorRef.current
      const selAfter = document.getSelection()
      const tag = value.toLowerCase()
      let start: Node | null = null
      if (formatBlockStartNode && root.contains(formatBlockStartNode)) {
        start = formatBlockStartNode
      } else if (selAfter && selAfter.rangeCount > 0 && root.contains(selAfter.anchorNode)) {
        start = selAfter.anchorNode
      } else {
        try {
          const r = savedEditorRangeRef.current
          if (r && root.contains(r.startContainer)) start = r.startContainer
        } catch {
          /* ignore */
        }
      }
      if (start) {
        let n: Node | null = start
        if (n.nodeType === Node.TEXT_NODE) n = n.parentNode
        while (n && n !== root) {
          if (n instanceof HTMLElement) {
            const t = n.tagName.toLowerCase()
            if (['p', 'div', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(t)) {
              if (t !== tag) {
                const neu = document.createElement(tag)
                neu.innerHTML = n.innerHTML
                n.parentNode?.replaceChild(neu, n)
                const nr = document.createRange()
                nr.selectNodeContents(neu)
                nr.collapse(false)
                if (selAfter) {
                  selAfter.removeAllRanges()
                  selAfter.addRange(nr)
                }
                try {
                  savedEditorRangeRef.current = nr.cloneRange()
                } catch {
                  /* ignore */
                }
              }
              break
            }
          }
          n = n.parentNode
        }
      }
    }
    if (editorRef.current) setContent(editorRef.current.innerHTML)
    setDirty(true)
    editorRef.current?.focus()
    setTimeout(updateFormatState, 0)
  }

  const openLinkModal = () => {
    setLinkUrl('https://')
    setShowLinkModal(true)
    setOpenMenu(null)
  }

  const submitLinkModal = () => {
    const url = linkUrl.trim()
    if (url) {
      execCommand('createLink', url)
      setShowLinkModal(false)
    }
  }

  const openTableModal = () => {
    setTableRows(3)
    setTableCols(3)
    setShowTableModal(true)
    setOpenMenu(null)
  }

  const submitTableModal = () => {
    const rows = Math.min(Math.max(tableRows, 1), 20)
    const cols = Math.min(Math.max(tableCols, 1), 10)
    let html = '<table border="1" style="border-collapse: collapse; width: 100%;"><tbody>'
    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) html += '<td style="padding: 4px; min-width: 60px;">&nbsp;</td>'
      html += '</tr>'
    }
    html += '</tbody></table><p></p>'
    document.execCommand('insertHTML', false, html)
    if (editorRef.current) setContent(editorRef.current.innerHTML)
    setDirty(true)
    setShowTableModal(false)
  }

  /** Ligne de séparation : insertHorizontalRule seul laisse souvent un <hr> sans bloc éditable après, ce qui bloque le curseur (saisie au-dessous / en dessous). */
  const insertHorizontalRule = () => {
    const ed = editorRef.current
    if (!ed) return
    ed.focus()
    const hrBlock =
      '<hr class="my-6 border-0 border-t-2 border-slate-200 dark:border-slate-600 clear-both" data-cloudity-hr="1" />' +
      '<p><br></p>'
    document.execCommand('insertHTML', false, hrBlock)
    if (editorRef.current) setContent(editorRef.current.innerHTML)
    setDirty(true)
    setTimeout(() => {
      const ed2 = editorRef.current
      if (!ed2) return
      const hrs = ed2.querySelectorAll('hr[data-cloudity-hr="1"]')
      const lastHr = hrs.length ? hrs[hrs.length - 1] : null
      lastHr?.removeAttribute('data-cloudity-hr')
      if (lastHr?.nextElementSibling instanceof HTMLElement) {
        const p = lastHr.nextElementSibling
        const r = document.createRange()
        r.setStart(p, 0)
        r.collapse(true)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(r)
      }
      ed2.focus()
    }, 0)
  }

  useEffect(() => {
    if (!openMenu) return
    const onOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('click', onOutside, true)
    return () => document.removeEventListener('click', onOutside, true)
  }, [openMenu])

  const switchToMarkdownMode = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? content
    setMarkdownSource(htmlToMarkdown(html))
    setMarkdownMode(true)
  }, [content])

  const switchToWysiwygMode = useCallback(() => {
    const html = markdownToHtml(markdownSource)
    setContent(html)
    if (editorRef.current) editorRef.current.innerHTML = html
    setMarkdownMode(false)
  }, [markdownSource])

  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  const handleSave = useCallback(async () => {
    if (!validId || !accessToken) return
    setSaving(true)
    try {
      if (rich && (markdownMode ? true : editorRef.current)) {
        const html = markdownMode ? markdownToHtml(markdownSource) : editorRef.current!.innerHTML
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
  }, [validId, accessToken, id, content, rich, name, gridRows, markdownMode, markdownSource])

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

  const doClose = useCallback(() => {
    if (editorState?.from === 'office') {
      navigate('/app/office')
    } else {
      navigate('/app/drive', editorState?.from === 'drive' && editorState?.breadcrumb ? { state: { breadcrumb: editorState.breadcrumb } } : undefined)
    }
  }, [navigate, editorState?.from, editorState?.breadcrumb])

  const handleClose = useCallback(() => {
    if (dirty) {
      setShowQuitConfirmModal(true)
      return
    }
    doClose()
  }, [dirty, doClose])

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

  const handleRenameSubmit = useCallback(async () => {
    const trimmed = renameValue.trim()
    if (!trimmed || !validId || !accessToken) return
    if (trimmed === name) {
      setShowRenameModal(false)
      return
    }
    setRenaming(true)
    try {
      await renameDriveNode(accessToken, id, trimmed)
      skipReloadAfterRenameRef.current = true
      setName(trimmed)
      queryClient.invalidateQueries({ queryKey: ['drive'] })
      setShowRenameModal(false)
      toast.success('Document renommé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors du renommage')
    } finally {
      setRenaming(false)
    }
  }, [validId, accessToken, id, name, renameValue, queryClient])

  const handleDeleteConfirm = useCallback(async () => {
    if (!validId || !accessToken) return
    setDeleting(true)
    try {
      await deleteDriveNode(accessToken, id)
      queryClient.invalidateQueries({ queryKey: ['drive'] })
      queryClient.invalidateQueries({ queryKey: ['drive', 'trash'] })
      setShowDeleteModal(false)
      toast.success('Déplacé dans la corbeille')
      if (editorState?.from === 'office') {
        navigate('/app/office')
      } else {
        navigate('/app/drive', editorState?.from === 'drive' && editorState?.breadcrumb ? { state: { breadcrumb: editorState.breadcrumb } } : undefined)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
  }, [validId, accessToken, id, queryClient, navigate, editorState?.from, editorState?.breadcrumb])

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
      if (rich && (markdownMode || editorRef.current)) {
        import('../../utils/exportOffice').then(({ htmlToDocxBlob }) => {
          const html = markdownMode ? markdownToHtml(markdownSource) : editorRef.current!.innerHTML
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
      if (markdownMode) return
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
  }, [dirty, validId, accessToken, id, content, rich, name, gridRows, markdownMode, markdownSource])

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

  const canUseMarkdownMode = rich && !isSpreadsheet(name) && (RICH_EXT.includes(getExtension(name)) || isWordDocument(name))
  const showToolbar = rich && !markdownMode && !isSpreadsheet(name)

  return (
    <div className="flex flex-col h-full">
      {/* Ligne 1 : Fil d'Ariane (Tableau de bord > Drive) + Nom du document + actions (Renommer, Fermer, Markdown, Enregistrer, Télécharger) */}
      <div className="border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <nav className="flex items-center gap-1.5 text-sm shrink-0" aria-label="Fil d'Ariane">
            <Link to="/app" className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium">Tableau de bord</Link>
            <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
            <Link to="/app/drive" className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium">Drive</Link>
          </nav>
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
          <span className="text-slate-900 dark:text-slate-100 font-semibold truncate min-w-0" title={name}>
            {name || 'Document'}
          </span>
          <span className="shrink-0 text-xs font-normal text-slate-500 dark:text-slate-400" aria-live="polite" title={dirty ? 'Modifications non enregistrées' : 'Enregistré'} data-testid="editor-save-state">
            {dirty ? 'Non enregistré' : 'Enregistré'}
          </span>
          <button
            type="button"
            onClick={() => { setRenameValue(name); setShowRenameModal(true) }}
            className="shrink-0 p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
            title="Renommer le document"
            aria-label="Renommer le document"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
              title="Fermer et revenir au Drive"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
            {canUseMarkdownMode && (
              <button
                type="button"
                onClick={markdownMode ? switchToWysiwygMode : switchToMarkdownMode}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${markdownMode ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                title={markdownMode ? 'Revenir au mode éditeur riche' : 'Passer en mode Markdown'}
              >
                <FileCode2 className="h-3.5 w-3.5" />
                {markdownMode ? 'Éditeur' : 'Markdown'}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </button>
            {rich && isWordDocument(name) && (
              <button
                type="button"
                onClick={handleDownloadDocx}
                disabled={exporting}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
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
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
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
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600"
                title="Télécharger en format Excel (.xlsx)"
              >
                <FileDown className="h-4 w-4" />
                Exporter .xlsx
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ligne 2 : Barre de menus type Word / Google Docs */}
      {showToolbar && (
        <div ref={menuBarRef} className="flex items-center gap-0 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/80 px-2 py-0.5">
          <div className="relative">
            <button type="button" onClick={() => setOpenMenu(openMenu === 'fichier' ? null : 'fichier')} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
              <FileText className="h-4 w-4" /> Fichier <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === 'fichier' && (
              <div className="absolute left-0 top-full z-50 mt-0.5 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1 max-h-[80vh] overflow-y-auto">
                <button type="button" onClick={() => { toast('Créer un document depuis le Drive ou Office'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <FileText className="h-4 w-4" /> Nouveau
                </button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { handleSave(); setOpenMenu(null) }} disabled={saving || !dirty} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50">
                  <Save className="h-4 w-4" /> Enregistrer
                </button>
                <button type="button" onClick={() => { window.print(); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
                <button type="button" onClick={() => { toast('Aperçu avant impression à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Eye className="h-4 w-4" /> Aperçu avant impression
                </button>
                {rich && isWordDocument(name) && (
                  <button type="button" onClick={() => { handleDownloadDocx(); setOpenMenu(null) }} disabled={exporting} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <FileDown className="h-4 w-4" /> Télécharger (.docx)
                  </button>
                )}
                <button type="button" onClick={() => { toast('Enregistrer sous à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Save className="h-4 w-4" /> Enregistrer sous…
                </button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { setShowMoveModal(true); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <FolderOpen className="h-4 w-4" /> Déplacer vers…
                </button>
                <button type="button" onClick={() => { setRenameValue(name); setShowRenameModal(true); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Edit2 className="h-4 w-4" /> Renommer
                </button>
                <button type="button" onClick={() => { setShowDeleteModal(true); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="h-4 w-4" /> Supprimer
                </button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { handleClose(); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <X className="h-4 w-4" /> Fermer
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setOpenMenu(openMenu === 'edition' ? null : 'edition')} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
              <Edit3 className="h-4 w-4" /> Édition <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === 'edition' && (
              <div className="absolute left-0 top-full z-50 mt-0.5 w-52 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1">
                <button type="button" onClick={() => { document.execCommand('undo'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Annuler</button>
                <button type="button" onClick={() => { document.execCommand('redo'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Rétablir</button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { document.execCommand('cut'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Scissors className="h-4 w-4" /> Couper</button>
                <button type="button" onClick={() => { document.execCommand('copy'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Copy className="h-4 w-4" /> Copier</button>
                <button type="button" onClick={() => { document.execCommand('paste'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><ClipboardPaste className="h-4 w-4" /> Coller</button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { document.execCommand('selectAll'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><MousePointer className="h-4 w-4" /> Tout sélectionner</button>
                <button type="button" onClick={() => { toast('Rechercher et remplacer à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">Rechercher et remplacer…</button>
              </div>
            )}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setOpenMenu(openMenu === 'affichage' ? null : 'affichage')} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
              <Eye className="h-4 w-4" /> Affichage <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === 'affichage' && (
              <div className="absolute left-0 top-full z-50 mt-0.5 w-52 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1">
                {canUseMarkdownMode && (
                  <button type="button" onClick={() => { (markdownMode ? switchToWysiwygMode : switchToMarkdownMode)(); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <FileCode2 className="h-4 w-4" /> {markdownMode ? 'Mode éditeur riche' : 'Mode Markdown'}
                  </button>
                )}
                {canSlideView && (
                  <button type="button" onClick={() => { openSlideView(); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <Presentation className="h-4 w-4" /> Vue diapos
                  </button>
                )}
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { toast('Zoom à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><ZoomIn className="h-4 w-4" /> Zoom avant</button>
                <button type="button" onClick={() => { toast('Zoom à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><ZoomOut className="h-4 w-4" /> Zoom arrière</button>
                <button type="button" onClick={() => { toast('Plein écran à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><Maximize2 className="h-4 w-4" /> Plein écran</button>
                <button type="button" onClick={() => { toast('Règles et repères à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><Ruler className="h-4 w-4" /> Règles</button>
              </div>
            )}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setOpenMenu(openMenu === 'insertion' ? null : 'insertion')} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
              <ImagePlus className="h-4 w-4" /> Insertion <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === 'insertion' && (
              <div data-testid="menu-insertion" className="absolute left-0 top-full z-50 mt-0.5 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1 max-h-[80vh] overflow-y-auto">
                <button type="button" onClick={openLinkModal} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <LinkIcon className="h-4 w-4" /> Lien
                </button>
                <button type="button" onClick={openTableModal} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Table className="h-4 w-4" /> Tableau
                </button>
                <button type="button" onClick={() => { toast('Insertion d’image à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <ImagePlus className="h-4 w-4" /> Image
                </button>
                <button type="button" onClick={() => { insertHorizontalRule(); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Minus className="h-4 w-4" /> Ligne horizontale
                </button>
                <button type="button" onClick={() => { execCommand('formatBlock', 'blockquote'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <Quote className="h-4 w-4" /> Citation
                </button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { toast('Caractère spécial à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">Caractère spécial…</button>
                <button type="button" onClick={() => { document.execCommand('insertHTML', false, '<br style="page-break-after: always;">'); if (editorRef.current) setContent(editorRef.current.innerHTML); setDirty(true); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Saut de page</button>
                <button type="button" onClick={() => { toast('En-tête et pied de page à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">En-tête et pied de page…</button>
              </div>
            )}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setOpenMenu(openMenu === 'format' ? null : 'format')} className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded">
              <Type className="h-4 w-4" /> Format <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {openMenu === 'format' && (
              <div data-testid="menu-format" className="absolute left-0 top-full z-50 mt-0.5 w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl py-1 max-h-[80vh] overflow-y-auto">
                <button type="button" onClick={() => { execCommand('formatBlock', 'h1'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Heading1 className="h-4 w-4" /> Titre 1</button>
                <button type="button" onClick={() => { execCommand('formatBlock', 'h2'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Heading2 className="h-4 w-4" /> Titre 2</button>
                <button type="button" onClick={() => { execCommand('formatBlock', 'h3'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Heading3 className="h-4 w-4" /> Titre 3</button>
                <button type="button" onClick={() => { execCommand('formatBlock', 'h4'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Heading4 className="h-4 w-4" /> Titre 4</button>
                <button type="button" onClick={() => { execCommand('formatBlock', 'h5'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Heading5 className="h-4 w-4" /> Titre 5</button>
                <button type="button" onClick={() => { execCommand('formatBlock', 'h6'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Heading6 className="h-4 w-4" /> Titre 6</button>
                <button type="button" onClick={() => { execCommand('formatBlock', 'p'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><Pilcrow className="h-4 w-4" /> Paragraphe</button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { execCommand('insertUnorderedList'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><List className="h-4 w-4" /> Liste à puces</button>
                <button type="button" onClick={() => { execCommand('insertOrderedList'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><ListOrdered className="h-4 w-4" /> Liste numérotée</button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { execCommand('justifyLeft'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><AlignLeft className="h-4 w-4" /> Aligner à gauche</button>
                <button type="button" onClick={() => { execCommand('justifyCenter'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><AlignCenter className="h-4 w-4" /> Centrer</button>
                <button type="button" onClick={() => { execCommand('justifyRight'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><AlignRight className="h-4 w-4" /> Aligner à droite</button>
                <button type="button" onClick={() => { execCommand('justifyFull'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"><AlignJustify className="h-4 w-4" /> Justifier</button>
                <hr className="my-1 border-slate-200 dark:border-slate-600" />
                <button type="button" onClick={() => { toast('Couleur de police à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><Type className="h-4 w-4" /> Couleur de police…</button>
                <button type="button" onClick={() => { toast('Surlignage à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><Highlighter className="h-4 w-4" /> Surlignage…</button>
                <button type="button" onClick={() => { toast('Retrait et espacement à venir'); setOpenMenu(null) }} className="flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">Retrait et espacement…</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ligne 3 : Barre d'outils de formatage (rapide) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          {showToolbar && (
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
                <button type="button" onClick={openLinkModal} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Insérer un lien"><LinkIcon className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'blockquote')} className={`p-2 rounded transition-colors ${formatState.formatBlock === 'blockquote' ? 'bg-brand-500 text-white shadow-sm hover:bg-brand-600' : 'hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'}`} title="Citation"><Quote className="h-4 w-4" /></button>
                <button type="button" onClick={insertHorizontalRule} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 transition-colors" title="Ligne horizontale"><Minus className="h-4 w-4" /></button>
              </div>
            </div>
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

      {/* Modal Renommer */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" aria-labelledby="rename-modal-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600">
              <h2 id="rename-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Renommer le document</h2>
              <button type="button" onClick={() => setShowRenameModal(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <label htmlFor="rename-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nom du fichier</label>
              <input
                id="rename-input"
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setShowRenameModal(false) }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400"
                placeholder="Nom du document"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-600">
              <button type="button" onClick={() => setShowRenameModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                Annuler
              </button>
              <button type="button" onClick={handleRenameSubmit} disabled={renaming || !renameValue.trim()} className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50">
                {renaming ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null}
                {renaming ? ' Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Supprimer (corbeille) */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600">
              <h2 id="delete-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Déplacer dans la corbeille ?</h2>
              <button type="button" onClick={() => setShowDeleteModal(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
              « {name} » sera déplacé dans la corbeille. Vous pourrez le restaurer ou le supprimer définitivement depuis la Corbeille du Drive.
            </p>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-600">
              <button type="button" onClick={() => setShowDeleteModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                Annuler
              </button>
              <button type="button" onClick={handleDeleteConfirm} disabled={deleting} className="px-4 py-2 rounded-lg bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 inline-flex items-center gap-2">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Déplacer dans la corbeille
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Insérer un lien */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" aria-labelledby="link-modal-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600">
              <h2 id="link-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Insérer un lien</h2>
              <button type="button" onClick={() => setShowLinkModal(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <label htmlFor="link-url-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">URL</label>
              <input
                id="link-url-input"
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitLinkModal(); if (e.key === 'Escape') setShowLinkModal(false) }}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400"
                placeholder="https://"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-600">
              <button type="button" onClick={() => setShowLinkModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                Annuler
              </button>
              <button type="button" onClick={submitLinkModal} disabled={!linkUrl.trim()} className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50">
                Insérer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Insérer un tableau */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" aria-labelledby="table-modal-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600">
              <h2 id="table-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Insérer un tableau</h2>
              <button type="button" onClick={() => setShowTableModal(false)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label htmlFor="table-rows-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre de lignes</label>
                <input
                  id="table-rows-input"
                  type="number"
                  min={1}
                  max={20}
                  value={tableRows}
                  onChange={(e) => setTableRows(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label htmlFor="table-cols-input" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre de colonnes</label>
                <input
                  id="table-cols-input"
                  type="number"
                  min={1}
                  max={10}
                  value={tableCols}
                  onChange={(e) => setTableCols(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 px-3 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-600">
              <button type="button" onClick={() => setShowTableModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                Annuler
              </button>
              <button type="button" onClick={submitTableModal} className="px-4 py-2 rounded-lg bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600">
                Insérer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmer quitter (modifications non enregistrées) */}
      {showQuitConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" role="dialog" aria-modal="true" aria-labelledby="quit-confirm-title">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-600 w-full max-w-md">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600">
              <h2 id="quit-confirm-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">Modifications non enregistrées</h2>
            </div>
            <p className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
              Quitter quand même ? Les modifications récentes ne seront pas enregistrées.
            </p>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-600">
              <button type="button" onClick={() => setShowQuitConfirmModal(false)} className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                Annuler
              </button>
              <button type="button" onClick={() => { setShowQuitConfirmModal(false); doClose() }} className="px-4 py-2 rounded-lg bg-amber-600 dark:bg-amber-500 text-white hover:bg-amber-700 dark:hover:bg-amber-600">
                Quitter
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
        {markdownMode && canUseMarkdownMode ? (
          <div className="max-w-3xl mx-auto">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Mode Markdown — la sauvegarde convertit en document riche.</p>
            <textarea
              value={markdownSource}
              onChange={(e) => { setMarkdownSource(e.target.value); setDirty(true) }}
              className="min-h-[300px] w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 resize-y"
              placeholder="# Titre\n\nContenu en **Markdown**…"
              spellCheck
            />
          </div>
        ) : rich ? (
          <div
            ref={editorRef}
            data-testid="document-editor-rich"
            contentEditable
            onInput={handleInput}
            className="min-h-[300px] max-w-3xl mx-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-6 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 prose dark:prose-invert prose-headings:font-semibold prose-blockquote:border-l-brand-500 prose-blockquote:italic prose-blockquote:pl-4 prose-hr:my-6 prose-hr:border-slate-200 dark:prose-hr:border-slate-600 [&_hr]:block [&_hr]:w-full [&_hr]:min-h-[1px]"
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
