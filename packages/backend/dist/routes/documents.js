"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const multer_1 = __importDefault(require("multer"));
const rag_1 = require("../services/rag");
const database_1 = require("../utils/database");
const logger_1 = require("../utils/logger");
const errorHandler_1 = require("../middleware/errorHandler");
const router = (0, express_1.Router)();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'text/plain',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Unsupported file type'));
        }
    },
});
// GET /api/documents - List documents for client
router.get('/', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const clientDb = new database_1.ClientDatabase(req.client.id);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const source = req.query.source;
    try {
        let query = 'SELECT * FROM documents WHERE client_id = $1';
        const params = [req.client.id];
        if (source) {
            query += ' AND source = $2';
            params.push(source);
        }
        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);
        const documents = await clientDb.queryInClientSchema(query, params);
        res.json({
            documents: documents || [],
            pagination: {
                limit,
                offset,
                total: documents?.length || 0,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to fetch documents:', {
            error,
            clientId: req.client.id,
        });
        throw error;
    }
}));
// POST /api/documents/upload - Upload and process document
router.post('/upload', upload.single('file'), (0, errorHandler_1.asyncHandler)(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            error: {
                code: 'NO_FILE_PROVIDED',
                message: 'No file was uploaded',
            },
        });
    }
    const clientDb = new database_1.ClientDatabase(req.client.id);
    const documentId = (0, uuid_1.v4)();
    try {
        // Extract text from file (simplified - you'd use proper parsers)
        let content = '';
        if (req.file.mimetype === 'text/plain') {
            content = req.file.buffer.toString('utf-8');
        }
        else {
            // For PDF/Word documents, you'd use libraries like pdf-parse or mammoth
            content = 'Document content extraction not implemented for this file type';
        }
        // Process and store document
        await rag_1.ragService.processDocument(clientDb, {
            id: documentId,
            title: req.file.originalname,
            content,
            source: 'upload',
            sourceId: documentId,
            metadata: {
                filename: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                uploadedBy: req.user.id,
            },
        });
        logger_1.logger.info('Document uploaded and processed:', {
            documentId,
            filename: req.file.originalname,
            clientId: req.client.id,
            userId: req.user.id,
        });
        res.json({
            document_id: documentId,
            filename: req.file.originalname,
            status: 'processed',
        });
    }
    catch (error) {
        logger_1.logger.error('Document upload failed:', {
            error,
            filename: req.file?.originalname,
            clientId: req.client.id,
            userId: req.user.id,
        });
        throw error;
    }
}));
// GET /api/documents/:id - Get specific document
router.get('/:id', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const documentId = req.params.id;
    const clientDb = new database_1.ClientDatabase(req.client.id);
    try {
        const documents = await clientDb.queryInClientSchema('SELECT * FROM documents WHERE id = $1 AND client_id = $2', [documentId, req.client.id]);
        if (!documents || documents.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'DOCUMENT_NOT_FOUND',
                    message: 'Document not found',
                },
            });
        }
        res.json(documents[0]);
    }
    catch (error) {
        logger_1.logger.error('Failed to fetch document:', {
            error,
            documentId,
            clientId: req.client.id,
        });
        throw error;
    }
}));
// DELETE /api/documents/:id - Delete document
router.delete('/:id', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const documentId = req.params.id;
    const clientDb = new database_1.ClientDatabase(req.client.id);
    try {
        // Delete document chunks first
        await clientDb.queryInClientSchema('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
        // Delete document
        await clientDb.queryInClientSchema('DELETE FROM documents WHERE id = $1 AND client_id = $2', [documentId, req.client.id]);
        logger_1.logger.info('Document deleted:', {
            documentId,
            clientId: req.client.id,
            userId: req.user.id,
        });
        res.json({ success: true });
    }
    catch (error) {
        logger_1.logger.error('Failed to delete document:', {
            error,
            documentId,
            clientId: req.client.id,
        });
        throw error;
    }
}));
// POST /api/documents/:id/reprocess - Reprocess document embeddings
router.post('/:id/reprocess', (0, errorHandler_1.asyncHandler)(async (req, res) => {
    const documentId = req.params.id;
    const clientDb = new database_1.ClientDatabase(req.client.id);
    try {
        const documents = await clientDb.queryInClientSchema('SELECT * FROM documents WHERE id = $1 AND client_id = $2', [documentId, req.client.id]);
        if (!documents || documents.length === 0) {
            return res.status(404).json({
                error: {
                    code: 'DOCUMENT_NOT_FOUND',
                    message: 'Document not found',
                },
            });
        }
        const document = documents[0];
        // Update embeddings
        await rag_1.ragService.updateDocumentEmbeddings(clientDb, documentId, document.content);
        logger_1.logger.info('Document reprocessed:', {
            documentId,
            clientId: req.client.id,
            userId: req.user.id,
        });
        res.json({ success: true, message: 'Document reprocessed successfully' });
    }
    catch (error) {
        logger_1.logger.error('Failed to reprocess document:', {
            error,
            documentId,
            clientId: req.client.id,
        });
        throw error;
    }
}));
exports.default = router;
