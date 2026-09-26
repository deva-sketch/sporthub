import app from './app.js';
import { config } from './config/index.js';

const port = Number(config.port) || 4000;

app.listen(port, () => {
  console.log(`🚀 Backend listening on http://localhost:${port}`);
});
