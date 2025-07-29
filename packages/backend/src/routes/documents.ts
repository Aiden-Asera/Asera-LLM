import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { ragService } from '../services/rag';
import { ClientDatabase } from '../utils/database';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
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
    } else {
      cb(new Error('Unsupported file type'));
    }
  },
});

// GET /api/documents - List documents for client
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const clientDb = new ClientDatabase(req.client!.id);
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  const source = req.query.source as string;

  try {
    let query = 'SELECT * FROM documents WHERE client_id = $1';
    const params: any[] = [req.client!.id];

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
  } catch (error) {
    logger.error('Failed to fetch documents:', {
      error,
      clientId: req.client!.id,
    });
    throw error;
  }
}));

// POST /api/documents/upload - Upload and process document
router.post('/upload', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({
      error: {
        code: 'NO_FILE_PROVIDED',
        message: 'No file was uploaded',
      },
    });
  }

  const clientDb = new ClientDatabase(req.client!.id);
  const documentId = uuidv4();

  try {
    // Extract text from file (simplified - you'd use proper parsers)
    let content = '';
    if (req.file.mimetype === 'text/plain') {
      content = req.file.buffer.toString('utf-8');
    } else {
      // For PDF/Word documents, you'd use libraries like pdf-parse or mammoth
      content = 'Document content extraction not implemented for this file type';
    }

    // Process and store document
    await ragService.processDocument(clientDb, {
      id: documentId,
      title: req.file.originalname,
      content,
      source: 'upload',
      sourceId: documentId,
      metadata: {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.user!.id,
      },
    });

    logger.info('Document uploaded and processed:', {
      documentId,
      filename: req.file.originalname,
      clientId: req.client!.id,
      userId: req.user!.id,
    });

    res.json({
      document_id: documentId,
      filename: req.file.originalname,
      status: 'processed',
    });
  } catch (error) {
    logger.error('Document upload failed:', {
      error,
      filename: req.file?.originalname,
      clientId: req.client!.id,
      userId: req.user!.id,
    });
    throw error;
  }
}));

// GET /api/documents/:id - Get specific document
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const documentId = req.params.id;
  const clientDb = new ClientDatabase(req.client!.id);

  try {
    const documents = await clientDb.queryInClientSchema(
      'SELECT * FROM documents WHERE id = $1 AND client_id = $2',
      [documentId, req.client!.id]
    );

    if (!documents || documents.length === 0) {
      return res.status(404).json({
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Document not found',
        },
      });
    }

    res.json(documents[0]);
  } catch (error) {
    logger.error('Failed to fetch document:', {
      error,
      documentId,
      clientId: req.client!.id,
    });
    throw error;
  }
}));

// DELETE /api/documents/:id - Delete document
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const documentId = req.params.id;
  const clientDb = new ClientDatabase(req.client!.id);

  try {
    // Delete document chunks first
    await clientDb.queryInClientSchema(
      'DELETE FROM document_chunks WHERE document_id = $1',
      [documentId]
    );

    // Delete document
    await clientDb.queryInClientSchema(
      'DELETE FROM documents WHERE id = $1 AND client_id = $2',
      [documentId, req.client!.id]
    );

    logger.info('Document deleted:', {
      documentId,
      clientId: req.client!.id,
      userId: req.user!.id,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete document:', {
      error,
      documentId,
      clientId: req.client!.id,
    });
    throw error;
  }
}));

// POST /api/documents/:id/reprocess - Reprocess document embeddings
router.post('/:id/reprocess', asyncHandler(async (req: Request, res: Response) => {
  const documentId = req.params.id;
  const clientDb = new ClientDatabase(req.client!.id);

  try {
    const documents = await clientDb.queryInClientSchema(
      'SELECT * FROM documents WHERE id = $1 AND client_id = $2',
      [documentId, req.client!.id]
    );

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
    await ragService.updateDocumentEmbeddings(clientDb, documentId, document.content);

    logger.info('Document reprocessed:', {
      documentId,
      clientId: req.client!.id,
      userId: req.user!.id,
    });

    res.json({ success: true, message: 'Document reprocessed successfully' });
  } catch (error) {
    logger.error('Failed to reprocess document:', {
      error,
      documentId,
      clientId: req.client!.id,
    });
    throw error;
  }
}));

export default router; 