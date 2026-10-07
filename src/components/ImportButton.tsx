import { Link } from "@tanstack/react-router";
import { FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ImportButton({ size = "sm" }: { size?: "sm" | "default" }) {
  return (
    <Button size={size} asChild>
      <Link to="/import">
        <FileUp className="mr-2 size-4" />
        Importer un relevé
      </Link>
    </Button>
  );
}
