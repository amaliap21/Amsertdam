import { DemoComponent } from "@/components/demo-component";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <h1 className="mb-8 text-4xl font-bold">Amsertdam Project</h1>
        <DemoComponent />
      </div>
    </div>
  );
}
