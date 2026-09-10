const { contextBridge, ipcRenderer } = require('electron');

// Expose secure IPC methods for file system access
contextBridge.exposeInMainWorld('electronAPI', {
    getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
    getRootPath: () => ipcRenderer.invoke('get-root-path'),
    createFolders: (args) => ipcRenderer.invoke('create-folders', args),
    printComponent: (htmlContent) => ipcRenderer.send('print-component', htmlContent),
    printLargeHtml: (htmlContent) => ipcRenderer.send('print-large-html', htmlContent),
    previewHtml: (htmlContent) => ipcRenderer.send('preview-html', htmlContent),
    saveHtmlAsPdf: (args) => ipcRenderer.invoke('save-html-as-pdf', args),
    selectFiles: () => ipcRenderer.invoke('select-files'),
    selectAndReadPoFile: () => ipcRenderer.invoke('select-and-read-po-file'),
    openPath: (filePath) => ipcRenderer.invoke('open-path', filePath),
    saveBackupFile: (args) => ipcRenderer.invoke('save-backup-file', args),
    saveMediaBackup: (mediaData) => ipcRenderer.invoke('save-media-backup', mediaData),
    // Clipboard and Export APIs
    clipboardReadText: () => ipcRenderer.invoke('clipboard-read-text'),
    clipboardWriteText: (text) => ipcRenderer.send('clipboard-write-text', text),
    saveExcelFile: (args) => ipcRenderer.invoke('save-excel-file', args),
    // FIX: Exposed missing media sync functions
    selectMediaRootPath: () => ipcRenderer.invoke('selectMediaRootPath'),
    scanProductFolders: (args) => ipcRenderer.invoke('scanProductFolders', args),
    // Add listener for on-demand recovery mode
    onShowRecoveryMode: (callback) => ipcRenderer.on('show-recovery-mode', (event, ...args) => callback(...args)),
});