export function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err.message);
  console.error(err.stack);

  if (err.name === 'SqliteError') {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'A record with this value already exists' });
    }
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(400).json({ error: 'Referenced record not found' });
    }
    return res.status(500).json({ error: 'Database error' });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
}
