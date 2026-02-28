module.exports = {
  apps: [
    {
      name: "agentic-backend",
      cwd: "./backend",
      script: "node",
      args: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 8082
      }
    },
    {
      name: "agentic-worker",
      cwd: "./backend",
      script: "node",
      args: "dist/worker.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 8082
      }
    }
  ]
};
