FROM node:20-slim

# Install Python + pip + create 'python' symlink
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/* && ln -sf /usr/bin/python3 /usr/bin/python

# Install Python packages
RUN pip3 install --break-system-packages PyMuPDF reportlab Pillow

WORKDIR /app

# Copy package files first for caching
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy rest of app
COPY . .

# Create data directories
RUN mkdir -p /data/uploads

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
