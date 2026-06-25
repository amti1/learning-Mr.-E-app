import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeDatabase } from './config/database.js';
import { errorHandler } from './middleware/errorHandler.js';

// Routes
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import unitRoutes from './routes/units.js';
import lessonRoutes from './routes/lessons.js';
import wordRoutes from './routes/words.js';
import practiceRoutes from './routes/practice.js';
import reviewRoutes from './routes/review.js';
import analyticsRoutes from './routes/analytics.js';
import searchRoutes from './routes/search.js';
import gamificationRoutes from './routes/gamification.js';
import adminRoutes from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from client build
app.use(express.static(join(__dirname, '..', 'dist')));

// Initialize database
initializeDatabase();
console.log('📦 Database initialized');

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/words', wordRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback (for production)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
  }
});

// Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Arabic Learning Platform server running on http://localhost:${PORT}`);
});

export default app;
