import { Hammer } from "lucide-react";

interface ComingSoonTabProps {
  title: string;
  description: string;
}

export function ComingSoonTab({ title, description }: ComingSoonTabProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Hammer className="h-10 w-10 text-muted-foreground/60 mb-4" />
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}
