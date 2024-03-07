# Use an official Node runtime as a parent image
FROM node:16-buster-slim

# Set the working directory in the container to /app
WORKDIR /app

# Copy the .npmrc file from the environment group
COPY .npmrc ./

COPY .env ./

# Add package.json and package-lock.json
COPY package*.json ./

# Install Python and other dependencies
RUN apt-get update && apt-get install -y \
    python g++ build-essential \
    gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 \
    libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 \
    libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 \
    ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget \
    libgbm1 && \
    apt-get clean && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Install any needed packages
RUN npm install

# Bundle app source
COPY . .

# Run the app when the container launches
CMD ["node", "index.js"]
