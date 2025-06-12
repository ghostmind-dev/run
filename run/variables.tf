# variables.tf

variable "ENVIRONMENT" {}
variable "PORT" {}
variable "PGHOST" {}
variable "PGUSER" {}
variable "PGPASSWORD" {}
variable "HASURA_GRAPHQL_ENDPOINT" {}
variable "HASURA_GRAPHQL_JWT_SECRET" {}
variable "HASURA_GRAPHQL_METADATA_DATABASE_URL" {}
variable "HASURA_GRAPHQL_DATABASE_URL" {}
variable "HASURA_GRAPHQL_ADMIN_SECRET" {}
variable "DB_POTION_ENDPOINT" {}
variable "DB_POTION_SECRET" {}
variable "RELAY_API_ENDPOINT" {}
variable "RELAY_API_SECRET" {}
variable "IMAGE_DIGEST_DEFAULT" {}
variable "PROJECT" {}
variable "APP" {}
variable "GCP_PROJECT_ID" {}


locals {
  env_vars = [
    {
      name  = "ENVIRONMENT"
      value = var.ENVIRONMENT
    },
    {
      name  = "PGHOST"
      value = var.PGHOST
    },
    {
      name  = "PGUSER"
      value = var.PGUSER
    },
    {
      name  = "PGPASSWORD"
      value = var.PGPASSWORD
    },
    {
      name  = "HASURA_GRAPHQL_ENDPOINT"
      value = var.HASURA_GRAPHQL_ENDPOINT
    },
    {
      name  = "HASURA_GRAPHQL_JWT_SECRET"
      value = var.HASURA_GRAPHQL_JWT_SECRET
    },
    {
      name  = "HASURA_GRAPHQL_METADATA_DATABASE_URL"
      value = var.HASURA_GRAPHQL_METADATA_DATABASE_URL
    },
    {
      name  = "HASURA_GRAPHQL_DATABASE_URL"
      value = var.HASURA_GRAPHQL_DATABASE_URL
    },
    {
      name  = "HASURA_GRAPHQL_ADMIN_SECRET"
      value = var.HASURA_GRAPHQL_ADMIN_SECRET
    },
    {
      name  = "DB_POTION_ENDPOINT"
      value = var.DB_POTION_ENDPOINT
    },
    {
      name  = "DB_POTION_SECRET"
      value = var.DB_POTION_SECRET
    },
    {
      name  = "RELAY_API_ENDPOINT"
      value = var.RELAY_API_ENDPOINT
    },
    {
      name  = "RELAY_API_SECRET"
      value = var.RELAY_API_SECRET
    },
    {
      name  = "IMAGE_DIGEST_DEFAULT"
      value = var.IMAGE_DIGEST_DEFAULT
    },
    {
      name  = "PROJECT"
      value = var.PROJECT
    },
    {
      name  = "APP"
      value = var.APP
    },
    {
      name  = "GCP_PROJECT_ID"
      value = var.GCP_PROJECT_ID
    }
  ]
}


