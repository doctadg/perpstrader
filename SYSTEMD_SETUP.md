# Running PerpsTrader as a systemd Service

## Quick Setup

### 1. Create the service file

```bash
sudo cp /home/d/PerpsTrader/systemd/perps-agent.service /etc/systemd/system/perps-agent.service
```

This service runs the LangGraph entry point (`bin/main.js`) and includes the dashboard.

### 2. Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable perps-agent
sudo systemctl start perps-agent
```

### 3. View logs

```bash
# Live logs
journalctl -u perps-agent -f

# Last 100 lines
journalctl -u perps-agent -n 100
```

### 4. Control commands

```bash
sudo systemctl stop perps-agent
sudo systemctl restart perps-agent
sudo systemctl status perps-agent
```

---

## Prediction Markets Agent

```bash
sudo cp /home/d/PerpsTrader/systemd/perps-predictions.service /etc/systemd/system/perps-predictions.service
sudo systemctl daemon-reload
sudo systemctl enable perps-predictions
sudo systemctl start perps-predictions
```

Logs:

```bash
journalctl -u perps-predictions -f
```

---

## Optional: ChromaDB Service

If using pattern memory:

```bash
sudo cp /home/d/PerpsTrader/systemd/chromadb.service /etc/systemd/system/chromadb.service
sudo systemctl daemon-reload
sudo systemctl enable chromadb
sudo systemctl start chromadb
```

---

## Dashboard Access

After starting: **http://your-server-ip:3001**
