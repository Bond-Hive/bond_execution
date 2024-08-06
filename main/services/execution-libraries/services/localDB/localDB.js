const jsonfile = require('jsonfile');
const fs = require('fs').promises;
const path = require('path');
const readdir = fs.readdir;

// LocalJsonDB Class
class LocalJsonDB {
    // Constructor initializes the collection path and other metadata
    constructor(collectionPath) {
        this.collectionPath = collectionPath;
        this.initialized = false;
        this.docsCount = 0;
        this.lastDocId = null;
        this.lastTimestamp = null;
    }

    // Updates the timestamp for the last operation
    _updateTimestamp() {
        this.lastTimestamp = Date.now();
    }

    // Updates metadata upon document insertion
    _updateMetaData() {
        this.lastDocId = this.lastDocId === null ? 0 : this.lastDocId + 1;
        this.docsCount++;
        this._updateTimestamp();
    }

    // Updates metadata upon document deletion
    _deleteMetaData() {
        this.docsCount--;
        this._updateTimestamp();
    }

    async _init() {
        if (this.initialized) {
            console.error('Already initialized!');
            return;
        }

        try {
            await fs.mkdir(this.collectionPath, { recursive: true });
        } catch (e) {
            // Directory probably exists
            console.warn('Directory might already exist');
        }

        // Check if directory exists and find the highest doc ID
        const files = await readdir(this.collectionPath);
        let highestId = -1;
        let totalFiles = 0;

        files.forEach(file => {
            totalFiles++;
            const id = parseInt(file.replace('.json', ''), 10);
            if (!isNaN(id) && id > highestId) {
                highestId = id;
            }
        });

        if (highestId !== -1) {
            this.lastDocId = highestId;
            this.docsCount = totalFiles;
        }

        this.initialized = true;
        this._updateTimestamp();
    }

    // Static method to create a new LocalJsonDB instance
    static async create(collectionPath) {
        const obj = new LocalJsonDB(collectionPath);
        try {
            await obj._init();
            return obj;
        } catch (error) {
            console.error(error);
            return;
        }
    }

    // Get the file path for a given document ID
    getFilePath(docId) {
        if (!this.collectionPath || !this.initialized) return false;
        return path.join(this.collectionPath, `${docId}.json`);
    }

    // General error handling method
    async _handleError(fn) {
        try {
            return await fn();
        } catch (err) {
            console.error(err);
            return;
        }
    }

    // Reads a single document by ID
    async readOne(docId) {
        // If docId is not provided get the last added document
        if (!docId) docId = this.lastDocId;
        const filePath = this.getFilePath(docId);
        if (!filePath) {
            throw new Error("It's not initialized or collectionPath doesn't exist.");
        }
        return this._handleError(async () => {
            return await jsonfile.readFile(filePath);
        });
    }

    // Inserts a single document
    async insertOne(data) {
        let docId = this.lastDocId === null ? 0 : this.lastDocId + 1;
        const filePath = this.getFilePath(docId);
        if (!filePath) {
            throw new Error("It's not initialized or collectionPath doesn't exist.");
        }
        return this._handleError(async () => {
            await jsonfile.writeFile(filePath, data);
            this._updateMetaData();
            return docId;
        });
    }

    // Deletes a single document by ID
    async deleteOne(docId, checkExist) {
        if (checkExist && !await this.exists(docId)) {
            return;
        }
        const filePath = this.getFilePath(docId);
        if (!filePath) {
            throw new Error("It's not initialized or collectionPath doesn't exist.");
        }
        return this._handleError(async () => {
            await fs.unlink(filePath);
            this._deleteMetaData();
            return true;
        });
    }

    // Replaces a single document by ID
    async replaceOne(docId, data, checkExist) {
        if (checkExist && !await this.exists(docId)) {
            return;
        }
        const filePath = this.getFilePath(docId);
        if (!filePath) {
            throw new Error("It's not initialized or collectionPath doesn't exist.");
        }
        return this._handleError(async () => {
            await jsonfile.writeFile(filePath, data);
            this._updateTimestamp();
            return true;
        });
    }

    // Updates a specific field in a document by ID
    async updateOne(docId, key, value, checkExist) {
        if (checkExist && !await this.exists(docId)) {
            return;
        }
        const filePath = this.getFilePath(docId);
        if (!filePath) {
            throw new Error("It's not initialized or collectionPath doesn't exist.");
        }
        return this._handleError(async () => {
            const data = await jsonfile.readFile(filePath);
            if (data) {
                data[key] = value;
                await jsonfile.writeFile(filePath, data);
            }
            return true;
        });
    }

    // Checks if a document exists by ID
    async exists(docId) {
        const filePath = this.getFilePath(docId);
        if (!filePath) {
            throw new Error("It's not initialized or collectionPath doesn't exist.");
        }
        try {
            await fs.access(filePath);
            return true;
        } catch {
            console.error(`Document with ID ${docId} does not exist.`);
            return false;
        }
    }
}

// Export the class
module.exports = LocalJsonDB;
