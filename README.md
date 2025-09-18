# 🛒 ReceiptMaster - Full-Featured Trading Service

A modern MVP trading service with React frontend and NestJS backend, including product management, order processing, and PDF receipt generation.

## 📁 Project Structure

```
market/
├── backend/                 # NestJS API server
│   ├── src/                # Backend source code
│   ├── test/               # E2E tests
│   ├── scripts/            # Initialization scripts
│   ├── package.json        # Backend dependencies
│   └── Dockerfile          # Docker image for API
├── frontend/               # React application
│   ├── src/                # Frontend source code
│   ├── public/             # Static files
│   ├── package.json        # Frontend dependencies
│   └── Dockerfile          # Docker image for frontend
├── docker-compose.yml      # Service orchestration
├── package.json            # Root package.json with workspace
└── README.md               # Documentation
```

## 🚀 Technologies

### Backend
- **NestJS** - Modern Node.js framework
- **TypeORM** - ORM with migrations
- **PostgreSQL** - Relational database
- **Puppeteer** - PDF receipt generation
- **Swagger** - API documentation
- **Jest** - Testing framework

### Frontend
- **React 19** with TypeScript
- **Vite** - Fast build tool
- **Tailwind CSS** - Styling
- **TanStack Query** - State management
- **React Router** - Navigation
- **Axios** - HTTP client

### DevOps
- **Docker Compose** - Containerization
- **Yarn Workspaces** - Dependency management
- **Concurrently** - Multi-process execution

## ⚡ Quick Start

### Prerequisites
- **Node.js**: Version 20 or higher
- **Yarn**: Version 1.22 or higher

### 1. Install Dependencies
```bash
# Install all dependencies (root, backend, frontend)
yarn install:all

# Or install separately
yarn install                    # Root dependencies
cd backend && yarn install      # Backend dependencies
cd ../frontend && yarn install  # Frontend dependencies
```

### 2. Run with Docker (Recommended)
```bash
# Start all services
yarn docker:up

# Run migrations
yarn backend:migration:run

# View logs
yarn docker:logs
```

### 3. Local Development
```bash
# Run backend and frontend simultaneously
yarn dev

# Or run separately
yarn backend:dev    # Backend on http://localhost:3000
yarn frontend:dev   # Frontend on http://localhost:5173
```

## 🌐 Service Access

- **Frontend**: http://localhost:5173
- **API**: http://localhost:3000
- **Swagger Documentation**: http://localhost:3000/docs
- **pgAdmin**: http://localhost:5050 (admin@market.com / admin)

## 📊 Features

### 🛍️ Product Management
- Create, edit, delete products
- Prices in kopecks for precision
- SKU and VAT support
- Active status management

### 👥 Recipient Management
- Order recipient database
- Contact information
- Search and filtering

### 📦 Order Management
- Create orders with product selection
- Price fixation at purchase time
- Statuses: draft → confirmed → cancelled
- Transactional operations

### 🧾 Receipt Generation
- Beautiful PDF receipts
- Unique receipt numbers
- PDF file downloads
- Integrity control

## 🛠️ Development Commands

### General Commands
```bash
yarn dev                    # Run in development mode
yarn build                  # Build all projects
yarn start                  # Run in production
yarn clean                  # Clean node_modules and dist
```

### Backend Commands
```bash
yarn backend:dev            # Run in development mode
yarn backend:build          # Build
yarn backend:test           # Unit tests
yarn backend:test:e2e       # E2E tests
yarn backend:migration:run  # Run migrations
yarn backend:migration:generate # Generate migration
```

### Frontend Commands
```bash
yarn frontend:dev           # Run in development mode
yarn frontend:build         # Build
yarn frontend:test          # Tests
yarn frontend:start         # Run in production
```

### Docker Commands
```bash
yarn docker:up              # Start all services
yarn docker:down            # Stop services
yarn docker:logs            # View logs
yarn docker:build           # Rebuild images
```

## 🔧 Configuration

### Backend (.env in backend folder)
```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=market_db
API_PREFIX=api/v1
API_KEY=your-secret-key-here
RECEIPT_STORAGE_PATH=./receipts
RECEIPT_BASE_URL=http://localhost:3000
```

### Frontend (.env in frontend folder)
```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_API_KEY=your-secret-key-here
```

## 🧪 Testing

```bash
# Backend tests
yarn backend:test:e2e

# Frontend tests (if added)
yarn frontend:test
```

## 📈 API Documentation

After starting the backend, Swagger documentation is available at:
http://localhost:3000/docs

## 🎯 Architecture Features

- **Modularity**: Clear separation between backend and frontend
- **Type Safety**: Full TypeScript support
- **Scalability**: Ready for team growth
- **DevOps**: Ready infrastructure for deployment
- **Testing**: E2E tests for critical scenarios

## 🚀 Production Ready

- ✅ **Security**: API keys, data validation
- ✅ **Monitoring**: Logging, Swagger documentation
- ✅ **Testing**: E2E tests for API
- ✅ **Containerization**: Docker for all services
- ✅ **Documentation**: Complete API and UI documentation
- ✅ **CI/CD**: Automated testing and deployment with GitHub Actions
- ✅ **Registry**: Docker images published to GitHub Container Registry

## 🔄 CI/CD Pipeline

### Automated Workflows

The project includes comprehensive GitHub Actions workflows:

- **Testing**: Automated testing on pull requests and pushes
- **Build & Deploy**: Automatic Docker image building and deployment
  - Pull requests: Builds images with commit SHA tags
  - Main branch: Builds images with both SHA and `latest` tags

### Docker Images

Images are automatically built and pushed to GitHub Container Registry:

- **Frontend**: `ghcr.io/{owner}/{repo}/frontend:latest`
- **Backend**: `ghcr.io/{owner}/{repo}/backend:latest`

### Usage

```bash
# Pull latest production images
docker pull ghcr.io/{owner}/{repo}/frontend:latest
docker pull ghcr.io/{owner}/{repo}/backend:latest

# Run with docker-compose
docker-compose up -d
```

For detailed CI/CD setup instructions, see [.github/README.md](.github/README.md).

## 📝 License

MIT License