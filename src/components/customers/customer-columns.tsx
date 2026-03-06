"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// ─── Customer row type ─────────────────────────────────────────────────────────

export type CustomerRow = {
  id: string
  full_name: string
  address: string | null
  phone: string | null
  route_name: string | null
  status: "active" | "paused" | "cancelled"
  pool_count: number
  assigned_tech_id: string | null
}

// ─── Status badge helpers ──────────────────────────────────────────────────────

type StatusVariant = "default" | "secondary" | "destructive" | "outline"

function getStatusVariant(status: CustomerRow["status"]): StatusVariant {
  switch (status) {
    case "active":
      return "default"
    case "paused":
      return "secondary"
    case "cancelled":
      return "destructive"
    default:
      return "outline"
  }
}

function getStatusLabel(status: CustomerRow["status"]): string {
  switch (status) {
    case "active":
      return "Active"
    case "paused":
      return "Paused"
    case "cancelled":
      return "Cancelled"
    default:
      return status
  }
}

// ─── Column definitions ────────────────────────────────────────────────────────

export const customerColumns: ColumnDef<CustomerRow>[] = [
  // 1. Full Name — sortable, links to customer detail
  {
    accessorKey: "full_name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
      </Button>
    ),
    cell: ({ row }) => (
      <Link
        href={`/customers/${row.original.id}`}
        className="font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.getValue("full_name")}
      </Link>
    ),
    enableSorting: true,
  },

  // 2. Address — sortable
  {
    accessorKey: "address",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Address
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.getValue("address") ?? "—"}
      </span>
    ),
    enableSorting: true,
  },

  // 3. Phone — sortable
  {
    accessorKey: "phone",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Phone
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.getValue("phone") ?? "—"}
      </span>
    ),
    enableSorting: true,
  },

  // 4. Route — sortable, filterable via equals
  {
    accessorKey: "route_name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Route
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.getValue("route_name") ?? "—"}
      </span>
    ),
    filterFn: "equals",
    enableSorting: true,
  },

  // 5. Status — filterable badge
  {
    accessorKey: "status",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Status
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
      </Button>
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as CustomerRow["status"]
      return (
        <Badge variant={getStatusVariant(status)}>
          {getStatusLabel(status)}
        </Badge>
      )
    },
    filterFn: "equals",
    enableSorting: true,
  },

  // 6. Pool Count — sortable
  {
    accessorKey: "pool_count",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 font-medium"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Pools
        <ArrowUpDown className="ml-2 h-3.5 w-3.5 text-muted-foreground/70" aria-hidden="true" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.getValue("pool_count")}
      </span>
    ),
    enableSorting: true,
  },

  // Hidden: assigned_tech_id — used for tech dropdown filter, not displayed
  {
    accessorKey: "assigned_tech_id",
    header: () => null,
    cell: () => null,
    filterFn: "equals",
    enableHiding: true,
  },
]
