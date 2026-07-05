import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function PlaceholderPage({
  title,
  description,
  milestone,
}: {
  title: string;
  description: string;
  milestone: string;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming in {milestone}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            Nothing here yet
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
