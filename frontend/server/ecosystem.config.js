const { env } = require("process");

module.exports = {
  apps: [
    {
      name: "react-frontend",
      cwd: "/home/student/a1119233/Fast-API-LMS_React/frontend/server",
      script: "npm",
      args: "run dev",
      env: { NODE_ENV: "development" },
    },
    {
      name: "ssl-proxy",
      script: "npx",
      args: "local-ssl-proxy --source 443 --target 3000 --cert /etc/pki/tls/certs/kanazawa-it.crt --key /etc/pki/tls/private/server.key",
      env: { NODE_ENV: "development" },
    },
  ],
};
