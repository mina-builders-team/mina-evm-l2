FROM node:22-alpine

WORKDIR /app

# Install required packages
RUN apk add --no-cache python3 make g++

# Copy package.json and install dependencies
COPY package*.json ./

# Copy the service source code
COPY src/ ./src/
RUN npm install

# Create data directories
RUN mkdir -p /data/saved_proofs /data/converted_proofs

CMD ["npm", "run", "start"]