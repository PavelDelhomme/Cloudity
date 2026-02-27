import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, Save, Loader2, Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Heading3, AlignLeft, AlignCenter, AlignRight, AlignJustify, Strikethrough, Link as LinkIcon, Minus, Quote, Pilcrow } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../authContext'
import {
  getDriveNodeContentAsText,
  putDriveNodeContent,
  fetchDriveNodes,
  type DriveNode,
} from '../../api'

const EDITABLE_EXT = ['.txt', '.md', '.html', '.csv']
const RICH_EXT = ['.html']

function getExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

function isRich(name: string): boolean {
  return RICH_EXT.includes(getExtension(name))
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
  const editorRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impossible de charger le fichier')
      navigate('/app/drive')
    } finally {
      setLoading(false)
    }
  }, [id, validId, accessToken, rich, navigate])

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
      if (node && !cancelled) setName(node.name)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [id, validId, accessToken])

  useEffect(() => {
    loadContent()
  }, [loadContent])

  useEffect(() => {
    if (name) setRich(isRich(name))
  }, [name])

  useEffect(() => {
    if (!rich || !editorRef.current) return
    editorRef.current.innerHTML = content || ''
  }, [rich])

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
  }

  const insertLink = () => {
    const url = window.prompt('URL du lien :', 'https://')
    if (url) execCommand('createLink', url)
  }

  const insertHorizontalRule = () => execCommand('insertHorizontalRule')

  const handleSave = useCallback(async () => {
    if (!validId || !accessToken) return
    const toSave = rich && editorRef.current ? editorRef.current.innerHTML : (textareaRef.current?.value ?? content)
    const mime = rich ? 'text/html' : (name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain')
    setSaving(true)
    try {
      await putDriveNodeContent(accessToken, id, toSave, mime)
      setDirty(false)
      toast.success('Enregistré')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }, [validId, accessToken, id, content, rich, name])

  // Sauvegarde automatique toutes les 30 s si modifié
  useEffect(() => {
    if (!dirty || !validId || !accessToken) return
    const t = setInterval(() => {
      if (!editorRef.current && !textareaRef.current) return
      const toSave = rich && editorRef.current ? editorRef.current.innerHTML : (textareaRef.current?.value ?? content)
      const mime = rich ? 'text/html' : (name.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain')
      putDriveNodeContent(accessToken, id, toSave, mime)
        .then(() => {
          setDirty(false)
          toast.success('Sauvegardé automatiquement')
        })
        .catch(() => {})
    }, 30_000)
    return () => clearInterval(t)
  }, [dirty, validId, accessToken, id, content, rich, name])

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
          <Link to="/app" className="hover:text-slate-700 dark:hover:text-slate-300">Tableau de bord</Link>
          <ChevronRight className="h-4 w-4" />
          <Link to="/app/drive" className="hover:text-slate-700 dark:hover:text-slate-300">Drive</Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-slate-900 dark:text-slate-100 font-medium truncate max-w-[180px]" title={name}>
            {name || 'Document'}
          </span>
        </nav>
        <div className="flex items-center gap-2">
          {rich && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-1">
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => execCommand('bold')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Gras"><Bold className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('italic')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Italique"><Italic className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('underline')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Souligné"><Underline className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('strikeThrough')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Barré"><Strikethrough className="h-4 w-4" /></button>
              </div>
              <span className="w-px h-5 bg-slate-200 dark:bg-slate-600" />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => execCommand('formatBlock', 'h1')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Titre 1"><Heading1 className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'h2')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Titre 2"><Heading2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'h3')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Titre 3"><Heading3 className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'p')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Paragraphe"><Pilcrow className="h-4 w-4" /></button>
              </div>
              <span className="w-px h-5 bg-slate-200 dark:bg-slate-600" />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => execCommand('insertUnorderedList')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Liste à puces"><List className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('insertOrderedList')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Liste numérotée"><ListOrdered className="h-4 w-4" /></button>
              </div>
              <span className="w-px h-5 bg-slate-200 dark:bg-slate-600" />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={() => execCommand('justifyLeft')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Aligner à gauche"><AlignLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('justifyCenter')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Centrer"><AlignCenter className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('justifyRight')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Aligner à droite"><AlignRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('justifyFull')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Justifier"><AlignJustify className="h-4 w-4" /></button>
              </div>
              <span className="w-px h-5 bg-slate-200 dark:bg-slate-600" />
              <div className="flex items-center gap-0.5">
                <button type="button" onClick={insertLink} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Insérer un lien"><LinkIcon className="h-4 w-4" /></button>
                <button type="button" onClick={() => execCommand('formatBlock', 'blockquote')} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Citation"><Quote className="h-4 w-4" /></button>
                <button type="button" onClick={insertHorizontalRule} className="p-2 rounded hover:bg-slate-200 dark:hover:bg-slate-600" title="Ligne horizontale"><Minus className="h-4 w-4" /></button>
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
        </div>
      </div>

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

export { EDITABLE_EXT, getExtension, isRich }
