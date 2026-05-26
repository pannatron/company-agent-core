module.exports = {
  apps: [
    {
      name: "company-agent-dashboard",
      cwd: "/home/monchai/company-agent-core/dashboard",
      script: "npm",
      args: "run start -- -p 3508",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: "3508",
      },
    },
  ],
};
