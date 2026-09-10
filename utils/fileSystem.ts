import { db } from '../db';

/**
 * Prompts the user to select a root directory using Electron's native dialog,
 * and saves the selected path to the database.
 * @returns {Promise<string|null>} The selected directory path or null if cancelled.
 */
async function selectAndSaveRootDirectory(): Promise<string | null> {
    try {
        const rootPath = await (window as any).electronAPI.getRootPath();
        if (rootPath) {
            await db.settings.put({ key: 'fileSystemRootPath', value: rootPath });
            return rootPath;
        }
        return null;
    } catch (error) {
        console.error("Error selecting root directory via Electron:", error);
        alert("Could not select directory. This feature may not be supported in your current environment.");
        return null;
    }
}

/**
 * Creates the standard folder structure for a given order within the user's selected root directory.
 * This version is compatible with Electron.
 * @param {string} supplier - The name of the supplier.
 * @param {string} orderId - The ID of the order.
 * @param {boolean} forcePicker - If true, force showing the directory picker.
 */
export async function createOrderFolderStructure(supplier: string, orderId: string, forcePicker = false): Promise<void> {
    let rootPathSetting = await db.settings.get('fileSystemRootPath');
    let rootPath = rootPathSetting?.value;

    if (!rootPath || forcePicker) {
        rootPath = await selectAndSaveRootDirectory();
        if (!rootPath) {
            console.log('User cancelled directory selection or an error occurred.');
            return; // Exit if no path was selected or saved
        }
    }
    
    try {
        const folderSetting = await db.settings.get('folderStructure');
        const structure = folderSetting?.value || [];
        
        const result = await (window as any).electronAPI.createFolders({ rootPath, supplier, orderId, structure });
        
        if (result.success) {
            alert(`Folder structure for ${orderId} has been created/verified in your selected directory.`);
        } else {
            throw new Error(result.error);
        }
    } catch (err: any) {
        console.error('Error creating folder structure:', err);
        alert(`Could not create folder structure. Please check permissions. Error: ${err.message}`);
    }
}