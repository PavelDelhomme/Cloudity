/**
 * @cloudity/web-drive — surface publique (FE-SPLIT-02).
 * Le shell cloudity-web importe DrivePage en lazy (DEV) ; PROD = SPA /app/drive/.
 */
export { default as DrivePage, renameBaseNameSelectionEnd } from './drive/DrivePage'
export type { EditorFromState } from './drive/DrivePage'
export {
  DEFAULT_DRIVE_APP_SETTINGS,
  loadDriveAppSettings,
  saveDriveAppSettings,
  type DriveAppSettings,
  type DriveDisplayMode,
} from './drive/driveAppSettings'
