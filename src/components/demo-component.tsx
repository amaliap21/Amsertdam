"use client";

import { useQuery } from "@tanstack/react-query";
import { useStore } from "@/store/use-store";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const sampleData = [
  { name: "Jan", value: 400 },
  { name: "Feb", value: 300 },
  { name: "Mar", value: 600 },
  { name: "Apr", value: 800 },
  { name: "May", value: 500 },
];

async function fetchData() {
  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return { message: "Hello from TanStack Query!" };
}

export function DemoComponent() {
  const { count, increment, decrement } = useStore();
  const { data, isLoading } = useQuery({
    queryKey: ["demo"],
    queryFn: fetchData,
  });

  return (
    <div className="space-y-8 p-8">
      <div className="rounded-lg border bg-card p-6">
        <h2 className="bg-yellow-primary mb-4 text-2xl font-bold">
          Zustand State Management
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={decrement}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Decrement
          </button>
          <span className="text-xl font-semibold">Count: {count}</span>
          <button
            onClick={increment}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Increment
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-2xl font-bold">TanStack Query</h2>
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <p className="text-lg">{data?.message}</p>
        )}
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h2 className="mb-4 text-2xl font-bold">Recharts</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sampleData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="hsl(var(--primary))" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
