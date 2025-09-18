# Hetzner Cloud Infrastructure for Market Service
terraform {
  required_version = ">= 1.0"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.0"
    }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

# Variables
variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "location" {
  description = "Hetzner Cloud location"
  type        = string
  default     = "nbg1"  # Nuremberg
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret key"
  type        = string
  sensitive   = true
}

variable "api_key" {
  description = "API key for authentication"
  type        = string
  sensitive   = true
}

variable "telegram_bot_token" {
  description = "Telegram bot token"
  type        = string
  sensitive   = true
}

# SSH Key (you need to create this in Hetzner Cloud console first)
data "hcloud_ssh_keys" "all" {
}

# Private network for servers communication
resource "hcloud_network" "market_network" {
  name     = "${var.environment}-market-network"
  ip_range = "10.0.0.0/16"
}

resource "hcloud_network_subnet" "market_subnet" {
  network_id   = hcloud_network.market_network.id
  type         = "cloud"
  network_zone = "eu-central"
  ip_range     = "10.0.1.0/24"
}

# Main server for application
resource "hcloud_server" "app" {
  name        = "${var.environment}-market-app"
  image       = "ubuntu-22.04"
  server_type = "cx22"  # 2 vCPU, 4GB RAM, 40GB SSD
  location    = var.location
  ssh_keys    = ["101552291"]  # Только существующий ключ на сервере

  labels = {
    environment = var.environment
    role        = "app"
  }
}

# Database server
resource "hcloud_server" "db" {
  name        = "${var.environment}-market-db"
  image       = "ubuntu-22.04"
  server_type = "cx22"  # 2 vCPU, 4GB RAM, 40GB SSD (оптимизированная конфигурация)
  location    = var.location
  ssh_keys    = ["101552291"]

  labels = {
    environment = var.environment
    role        = "database"
  }
}

# Attach servers to private network
resource "hcloud_server_network" "app_network" {
  server_id  = hcloud_server.app.id
  network_id = hcloud_network.market_network.id
  ip         = "10.0.1.10"
}

resource "hcloud_server_network" "db_network" {
  server_id  = hcloud_server.db.id
  network_id = hcloud_network.market_network.id
  ip         = "10.0.1.20"
}


# Note: Using server's default IP instead of floating IP for simplicity

# Firewall for app server
resource "hcloud_firewall" "app" {
  name = "${var.environment}-market-app-fw-v3"

  rule {
    direction = "in"
    port      = "22"
    protocol  = "tcp"
    source_ips = ["0.0.0.0/0"]
  }

  rule {
    direction = "in"
    port      = "80"
    protocol  = "tcp"
    source_ips = ["0.0.0.0/0"]
  }

  rule {
    direction = "in"
    port      = "3000"
    protocol  = "tcp"
    source_ips = ["0.0.0.0/0"]
  }

  rule {
    direction = "in"
    port      = "443"
    protocol  = "tcp"
    source_ips = ["0.0.0.0/0"]
  }
}

# Firewall for database server (only SSH and PostgreSQL from app server)
resource "hcloud_firewall" "db" {
  name = "${var.environment}-market-db-fw"

  rule {
    direction = "in"
    port      = "22"
    protocol  = "tcp"
    source_ips = ["0.0.0.0/0"]
  }

  rule {
    direction = "in"
    port      = "5432"
    protocol  = "tcp"
    source_ips = ["10.0.1.0/24"]  # Only from private network
  }
}

# Attach firewalls to servers
resource "hcloud_firewall_attachment" "app" {
  firewall_id = hcloud_firewall.app.id
  server_ids  = [hcloud_server.app.id]
}

resource "hcloud_firewall_attachment" "db" {
  firewall_id = hcloud_firewall.db.id
  server_ids  = [hcloud_server.db.id]
}


# Outputs
output "app_server_ip" {
  description = "Public IP of the app server"
  value       = hcloud_server.app.ipv4_address
}

output "app_server_private_ip" {
  description = "Private IP of the app server"
  value       = hcloud_server_network.app_network.ip
}

output "app_server_name" {
  description = "Name of the app server"
  value       = hcloud_server.app.name
}

output "db_server_ip" {
  description = "Public IP of the database server"
  value       = hcloud_server.db.ipv4_address
}

output "db_server_private_ip" {
  description = "Private IP of the database server"
  value       = hcloud_server_network.db_network.ip
}

output "db_server_name" {
  description = "Name of the database server"
  value       = hcloud_server.db.name
}

output "network_id" {
  description = "ID of the private network"
  value       = hcloud_network.market_network.id
}
