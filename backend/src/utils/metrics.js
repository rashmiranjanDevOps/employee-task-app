'use strict';

const client = require('prom-client');

const register = new client.Registry();

client.collectDefaultMetrics({ register, prefix: 'task_tracker_' });

// HTTP request duration histogram
const httpRequestDuration = new client.Histogram({
  name: 'task_tracker_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// HTTP request counter
const httpRequestCounter = new client.Counter({
  name: 'task_tracker_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// Active tasks gauge
const activeTasksGauge = new client.Gauge({
  name: 'task_tracker_active_tasks_total',
  help: 'Number of active (non-archived) tasks',
  labelNames: ['status'],
  registers: [register],
});

// Auth attempts counter
const authAttemptsCounter = new client.Counter({
  name: 'task_tracker_auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['type', 'result'],
  registers: [register],
});

// DB query duration
const dbQueryDuration = new client.Histogram({
  name: 'task_tracker_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'model'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register],
});

// Middleware to record HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const route = req.route?.path || req.path || 'unknown';
    const duration = (Date.now() - start) / 1000;
    const labels = { method: req.method, route, status_code: res.statusCode };
    httpRequestDuration.observe(labels, duration);
    httpRequestCounter.inc(labels);
  });
  next();
};

// Metrics endpoint handler
const metricsEndpoint = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
};

module.exports = {
  register,
  httpRequestDuration,
  httpRequestCounter,
  activeTasksGauge,
  authAttemptsCounter,
  dbQueryDuration,
  metricsMiddleware,
  metricsEndpoint,
};
