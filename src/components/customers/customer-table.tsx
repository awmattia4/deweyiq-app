"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table"
import { PlusIcon, SearchIcon } from "lucide-react"
import { customerColumns } from "./customer-columns"
import type { CustomerRow } from "./customer-columns"
import { AddCustomerDialog } from "./add-customer-dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tech = {
  id: string
  full_name: string | null
}

interface CustomerTableProps {
  data: CustomerRow[]
  techs: Tech[]
  routes: string[]
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CustomerTable({ data, techs, routes }: CustomerTableProps) {
  const router = useRouter()

  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const table = useReactTable({
    data,
    columns: customerColumns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  function handleRowClick(customerId: string) {
    router.push(`/customers/${customerId}`)
  }

  function handleRouteFilter(value: string) {
    if (value === "__all__") {
      table.getColumn("route_name")?.setFilterValue(undefined)
    } else {
      table.getColumn("route_name")?.setFilterValue(value)
    }
  }

  function handleStatusFilter(value: string) {
    if (value === "__all__") {
      table.getColumn("status")?.setFilterValue(undefined)
    } else {
      table.getColumn("status")?.setFilterValue(value)
    }
  }

  // Tech filter uses global filter approach since assigned_tech_id isn't displayed
  // We store selected tech name and filter via global filter on name
  function handleTechFilter(value: string) {
    if (value === "__all__") {
      // Clear any tech-specific filter — reset global filter if it was set for tech
      setGlobalFilter("")
    }
    // Tech filter is limited without the tech name in the row — see note below
    // For now we filter on the tech name in a future iteration; routing by name works
    // via the assigned_tech_id in the full data. Since CustomerRow doesn't include
    // assigned_tech name, this is a placeholder for the UX pattern.
    // In Plan 03, when we have full detail data, we can add assigned_tech_name to CustomerRow.
  }

  const rows = table.getRowModel().rows

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search + filters */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Global instant search */}
          <div className="relative min-w-[200px] max-w-xs">
            <SearchIcon
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              placeholder="Search customers..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 h-9"
              aria-label="Search customers"
            />
          </div>

          {/* Route filter */}
          <Select onValueChange={handleRouteFilter} defaultValue="__all__">
            <SelectTrigger className="w-[140px] h-9" aria-label="Filter by route">
              <SelectValue placeholder="All Routes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Routes</SelectItem>
              {routes.map((route) => (
                <SelectItem key={route} value={route}>
                  {route}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select onValueChange={handleStatusFilter} defaultValue="__all__">
            <SelectTrigger className="w-[130px] h-9" aria-label="Filter by status">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          {/* Assigned Tech filter */}
          <Select onValueChange={handleTechFilter} defaultValue="__all__">
            <SelectTrigger className="w-[150px] h-9" aria-label="Filter by assigned tech">
              <SelectValue placeholder="All Techs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Techs</SelectItem>
              {techs.map((tech) => (
                <SelectItem key={tech.id} value={tech.id}>
                  {tech.full_name ?? "Unknown"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Add Customer button */}
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => setIsDialogOpen(true)}
        >
          <PlusIcon className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Add Customer
        </Button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              /* Empty state */
              <TableRow>
                <TableCell
                  colSpan={customerColumns.length}
                  className="h-48 text-center"
                >
                  <div className="flex flex-col items-center gap-3 py-8">
                    <p className="text-sm text-muted-foreground">
                      {globalFilter || columnFilters.length > 0
                        ? "No customers match your filters."
                        : "No customers yet. Add your first customer to get started."}
                    </p>
                    {!globalFilter && columnFilters.length === 0 && (
                      <Button
                        size="sm"
                        onClick={() => setIsDialogOpen(true)}
                      >
                        <PlusIcon className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Add Customer
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Row count ───────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {data.length} customer{data.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* ── Add Customer dialog ─────────────────────────────────────────── */}
      <AddCustomerDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  )
}
