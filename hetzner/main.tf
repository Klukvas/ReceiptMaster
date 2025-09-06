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

# SSH Key (you need to create this in Hetzner Cloud console first)
data "hcloud_ssh_keys" "all" {
}

# Main server for application
resource "hcloud_server" "app" {
  name        = "${var.environment}-market-app"
  image       = "ubuntu-22.04"
  server_type = "cx22"  # 2 vCPU, 4GB RAM, 40GB SSD
  location    = var.location
  ssh_keys    = data.hcloud_ssh_keys.all.ssh_keys[*].id

  labels = {
    environment = var.environment
    role        = "app"
  }
}


# Note: Using server's default IP instead of floating IP for simplicity

# Firewall for app server
resource "hcloud_firewall" "app" {
  name = "${var.environment}-market-app-fw"

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

# Attach firewall to app server
resource "hcloud_firewall_attachment" "app" {
  firewall_id = hcloud_firewall.app.id
  server_ids  = [hcloud_server.app.id]
}


# Outputs
output "app_server_ip" {
  description = "Public IP of the app server"
  value       = hcloud_server.app.ipv4_address
}

output "app_server_private_ip" {
  description = "Private IP of the app server"
  value       = hcloud_server.app.ipv4_address
}

output "app_server_name" {
  description = "Name of the app server"
  value       = hcloud_server.app.name
}
