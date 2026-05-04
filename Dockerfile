# Explicitly use the x86_64 version of the Node.js 24 base image
FROM public.ecr.aws/lambda/nodejs:24-x86_64

# AWS base images use /var/task as the default working directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy dependency files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy your source code
COPY . .

# Set the CMD to your handler function
# If your server.js exports a function named 'handler', use:
CMD [ "server.handler" ]
