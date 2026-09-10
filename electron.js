const { app, BrowserWindow, shell, ipcMain, dialog, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Define a path for our configuration file in a stable location (user's home directory).
const configPath = path.join(app.getPath('home'), '.newland-order-solution-config.json');

/**
 * Creates the main application window.
 */
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // --- Custom Application Menu ---
  const isMac = process.platform === 'darwin';

  const template = [
    // { role: 'appMenu' } for macOS
    ...(isMac ? [{
        label: app.name,
        submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
        ]
    }] : []),
    // { role: 'fileMenu' }
    {
        label: 'File',
        submenu: [
            isMac ? { role: 'close' } : { role: 'quit' }
        ]
    },
    // { role: 'editMenu' }
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            ...(isMac ? [
                { role: 'pasteAndMatchStyle' },
                { role: 'delete' },
                { role: 'selectAll' },
                { type: 'separator' },
                {
                    label: 'Speech',
                    submenu: [
                        { role: 'startSpeaking' },
                        { role: 'stopSpeaking' }
                    ]
                }
            ] : [
                { role: 'delete' },
                { type: 'separator' },
                { role: 'selectAll' }
            ])
        ]
    },
    // { role: 'viewMenu' }
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { type: 'separator' },
            {
                label: 'Repair',
                accelerator: 'CmdOrCtrl+Shift+R',
                click: () => {
                    mainWindow.webContents.send('show-recovery-mode');
                }
            },
            { type: 'separator' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    },
    // { role: 'windowMenu' }
    {
        label: 'Window',
        submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            ...(isMac ? [
                { type: 'separator' },
                { role: 'front' },
                { type: 'separator' },
                { role: 'window' }
            ] : [
                { role: 'close' }
            ])
        ]
    },
    {
        role: 'help',
        submenu: [
            {
                label: 'Learn More',
                click: async () => {
                    await shell.openExternal('https://electronjs.org');
                }
            }
        ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/**
 * This function handles the entire app initialization process.
 * It configures the user data path first, and only then creates the main window.
 */
async function initializeAndCreateWindow() {
  try {
    let userDataPath;

    // Check if the configuration file already exists.
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.customPath && fs.existsSync(config.customPath)) {
        userDataPath = config.customPath;
      }
    }

    // If no path is configured, prompt the user to select one.
    if (!userDataPath) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Data Storage Location',
        message: 'Please choose a folder to store all application data (database, settings, etc.).',
        properties: ['openDirectory', 'createDirectory']
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        dialog.showErrorBox('Configuration Required', 'A data storage location must be selected to run the application.');
        app.quit();
        return;
      }

      const chosenPath = filePaths[0];
      const dataDir = path.join(chosenPath, 'NewlandOrderSolutionData');
      
      if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
      }
      
      userDataPath = dataDir;

      // Save the chosen path for future launches.
      fs.writeFileSync(configPath, JSON.stringify({ customPath: userDataPath }, null, 2));
    }

    console.log(`Using custom data path: ${userDataPath}`);
    app.setPath('userData', userDataPath);

  } catch (error) {
    console.error('Failed to configure user data path:', error);
    dialog.showErrorBox('Fatal Configuration Error', `Could not set the data storage location. Please check permissions.\n\n${error.message}`);
    app.quit();
    return;
  }
  
  // Check if running from a disk image on macOS, which can cause crashes.
  if (process.platform === 'darwin') {
    if (app.getAppPath().startsWith('/Volumes/')) {
      const { response } = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Quit', 'Run Anyway'],
          title: 'Run from Applications Folder',
          message: 'It looks like you are running this application from a disk image.',
          detail: 'To prevent crashes and data loss, please drag the application to your Applications folder and run it from there.',
          defaultId: 0,
          cancelId: 0,
      });

      if (response === 0) { // User chose 'Quit'
          app.quit();
          return;
      }
    }
  }
  
  // Now that the data path is configured, create the main window.
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}


// --- App Lifecycle ---

// This is the main entry point. It waits for Electron to be ready, then runs our initialization.
app.whenReady().then(initializeAndCreateWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


// --- IPC Handlers for File System Access ---
const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain'
};


ipcMain.handle('select-and-read-po-file', async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  if (!parentWindow) return null;

  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, {
    title: 'Import Purchase Order',
    properties: ['openFile'],
    filters: [
      { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  const filePath = filePaths[0];
  try {
    const buffer = fs.readFileSync(filePath);
    const base64Data = buffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_MAP[ext] || 'application/octet-stream';

    return {
      name: path.basename(filePath),
      mimeType: mimeType,
      data: base64Data
    };
  } catch (error) {
    console.error('Failed to read file for PO import:', error);
    dialog.showErrorBox('File Read Error', `Could not read the selected file: ${error.message}`);
    return null;
  }
});


ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

ipcMain.handle('get-root-path', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) {
    return null;
  }
  const rootPath = filePaths[0];
  
  try {
    const files = fs.readdirSync(rootPath);
    if (files.length > 0) {
      const choice = dialog.showMessageBoxSync({
        type: 'warning',
        buttons: ['Cancel', 'Use Anyway'],
        title: 'Directory Not Empty',
        message: `The selected directory '${path.basename(rootPath)}' is not empty.`,
        detail: 'The app will create new folders inside it but will not delete existing content. Do you want to use it anyway?',
        defaultId: 1,
        cancelId: 0
      });

      if (choice === 0) {
        return null;
      }
    }
  } catch (error) {
     console.error('Failed to read directory:', error);
     dialog.showErrorBox('Directory Error', `Could not read the selected directory: ${error.message}`);
     return null;
  }

  return rootPath;
});

ipcMain.handle('selectMediaRootPath', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Product Media Root Folder'
    });
    if (canceled || filePaths.length === 0) {
        return null;
    }
    return filePaths[0];
});

ipcMain.handle('scanProductFolders', async (event, { rootPath, codes }) => {
    const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const MANUAL_EXTENSIONS = ['.pdf'];
    const IMAGE_SUBFOLDERS = ['Raw_Images', '3D'];
    const MANUAL_SUBFOLDERS = ['manual'];

    const readFilesFromSubfolders = (productPath, subfolderNames, extensions) => {
        const filesData = [];
        for (const subfolder of subfolderNames) {
            const fullPath = path.join(productPath, subfolder);
            if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
                const files = fs.readdirSync(fullPath);
                for (const file of files) {
                    const ext = path.extname(file).toLowerCase();
                    if (extensions.includes(ext)) {
                        try {
                            const filePath = path.join(fullPath, file);
                            const buffer = fs.readFileSync(filePath);
                            filesData.push({
                                name: file,
                                data: buffer.toString('base64'),
                                mimeType: MIME_MAP[ext] || 'application/octet-stream'
                            });
                        } catch (readError) {
                            console.error(`Could not read file ${filePath}:`, readError);
                        }
                    }
                }
            }
        }
        return filesData;
    };

    try {
        const productDirs = fs.readdirSync(rootPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const targetCodes = codes && codes.length > 0 ? codes : productDirs;
        const scannedData = [];

        for (const code of targetCodes) {
            const productDirPath = path.join(rootPath, code);
            if (fs.existsSync(productDirPath)) {
                const images = readFilesFromSubfolders(productDirPath, IMAGE_SUBFOLDERS, IMAGE_EXTENSIONS);
                const manuals = readFilesFromSubfolders(productDirPath, MANUAL_SUBFOLDERS, MANUAL_EXTENSIONS);

                if (images.length > 0 || manuals.length > 0) {
                    scannedData.push({
                        productCode: code,
                        images,
                        manuals
                    });
                }
            }
        }
        return { success: true, data: scannedData };
    } catch (error) {
        console.error('Failed to scan product folders:', error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle('create-folders', async (event, { rootPath, supplier, orderId, structure }) => {
  try {
    const orderPath = path.join(rootPath, supplier, orderId);
    fs.mkdirSync(orderPath, { recursive: true });

    for (const subfolder of structure) {
      const subfolderPath = path.join(orderPath, subfolder);
      if (!fs.existsSync(subfolderPath)) {
        fs.mkdirSync(subfolderPath, { recursive: true });
      }
    }
    return { success: true };
  } catch (error) {
    console.error('Failed to create folder structure:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.on('print-large-html', (event, htmlContent) => {
    const tempFilePath = path.join(app.getPath('temp'), `print-${Date.now()}.html`);
    
    try {
        fs.writeFileSync(tempFilePath, htmlContent, 'utf-8');

        const printWindow = new BrowserWindow({
            width: 800,
            height: 600,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true, 
            },
        });

        printWindow.loadFile(tempFilePath);

        printWindow.webContents.on('did-finish-load', () => {
            printWindow.webContents.print({}, (success, errorType) => {
                if (!success) {
                    console.error(`Printing failed: ${errorType}`);
                }
                if (!printWindow.isDestroyed()) {
                    printWindow.close();
                }
            });
        });

        printWindow.on('closed', () => {
            try {
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            } catch (err) {
                console.error('Failed to delete temp print file:', err);
            }
        });

    } catch (err) {
        console.error('Error handling print-large-html:', err);
    }
});

ipcMain.on('print-component', (event, htmlContent) => {
    const printWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    printWindow.webContents.on('did-finish-load', () => {
        printWindow.webContents.print({}, (success, errorType) => {
            if (!success) {
                console.log(`Printing failed: ${errorType}`);
            }
            printWindow.close();
        });
    });
});

ipcMain.on('preview-html', (event, htmlContent) => {
    const previewWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
});

ipcMain.handle('save-html-as-pdf', async (event, { htmlContent, defaultFileName }) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
        title: 'Save Brochure as PDF',
        defaultPath: defaultFileName || 'brochure.pdf',
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
        return { success: false, error: 'Save cancelled by user.' };
    }

    const tempWindow = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
    const tempFilePath = path.join(app.getPath('temp'), `brochure-${Date.now()}.html`);
    
    try {
        // Write HTML to a temporary file
        fs.writeFileSync(tempFilePath, htmlContent, 'utf-8');

        // Load the temporary file
        await tempWindow.loadFile(tempFilePath);
        
        const pdfData = await tempWindow.webContents.printToPDF({
            marginsType: 0,
            pageSize: 'A4',
            printBackground: true,
        });

        fs.writeFileSync(filePath, pdfData);
        return { success: true, filePath };

    } catch (error) {
        console.error('Failed to save PDF:', error);
        return { success: false, error: error.message };
    } finally {
        // Clean up the temporary window and file
        if (tempWindow && !tempWindow.isDestroyed()) {
            tempWindow.close();
        }
        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        } catch (cleanupError) {
            console.error('Failed to delete temporary PDF HTML file:', cleanupError);
        }
    }
});

ipcMain.handle('select-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections']
    });
    if (canceled || !filePaths) {
        return [];
    }
    return filePaths;
});

ipcMain.handle('open-path', async (event, filePath) => {
    try {
        await shell.openPath(filePath);
        return { success: true };
    } catch (error) {
        console.error('Failed to open path:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-backup-file', async (event, { jsonData, defaultPath }) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  if (!parentWindow) return { success: false, error: 'Parent window not found' };

  try {
    const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
      title: 'Save Backup File',
      defaultPath: defaultPath,
      filters: [
        { name: 'JSON Files', extensions: ['json'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, error: 'Save cancelled by user.' };
    }

    fs.writeFileSync(filePath, jsonData, 'utf-8');
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to save backup file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-media-backup', async (event, allMediaData) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  if (!parentWindow) return { success: false, error: 'Parent window not found' };

  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow, {
      title: 'Select Folder to Save Media Backup',
      properties: ['openDirectory', 'createDirectory']
    });

    if (canceled || !filePaths || filePaths.length === 0) {
      return { success: false, error: 'Save cancelled by user.' };
    }

    const rootPath = filePaths[0];
    let filesSaved = 0;

    for (const media of allMediaData) {
      const { productCode, type, fileName, base64Data } = media;
      const productFolderPath = path.join(rootPath, productCode.replace(/[\/\\?%*:|"<>]/g, '_'));
      const typeFolderPath = path.join(productFolderPath, type === 'image' ? 'images' : 'attachments');
      const finalFilePath = path.join(typeFolderPath, fileName.replace(/[\/\\?%*:|"<>]/g, '_'));
      
      try {
        if (!fs.existsSync(typeFolderPath)) {
          fs.mkdirSync(typeFolderPath, { recursive: true });
        }
        
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(finalFilePath, buffer);
        filesSaved++;
      } catch (writeError) {
        console.error(`Failed to save file ${finalFilePath}:`, writeError);
        // Continue to save other files
      }
    }

    shell.openPath(rootPath);
    return { success: true, filesSaved, folderPath: rootPath };
  } catch (error) {
    console.error('Failed to save media backup:', error);
    return { success: false, error: error.message };
  }
});

// --- Clipboard and Export Handlers ---
ipcMain.handle('clipboard-read-text', () => {
  return clipboard.readText();
});

ipcMain.on('clipboard-write-text', (event, text) => {
  clipboard.writeText(text);
});

ipcMain.handle('save-excel-file', async (event, { buffer, defaultPath }) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  if (!parentWindow) return { success: false, error: 'Parent window not found' };

  try {
    const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
      title: 'Export to Excel',
      defaultPath: defaultPath,
      filters: [
        { name: 'Excel Workbook', extensions: ['xlsx'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, error: 'Save cancelled by user.' };
    }

    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to save Excel file:', error);
    return { success: false, error: error.message };
  }
});