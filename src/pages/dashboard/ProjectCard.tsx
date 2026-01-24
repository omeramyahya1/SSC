import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectCardProps {
    project: {
        id: number;
        name: string;
        customerName: string;
        size: string;
        status: string;
    };
}

export function ProjectCard({ project }: ProjectCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription>Customer: {project.customerName}</CardDescription>
            </CardHeader>
            <CardContent>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                <div className="flex justify-between text-sm text-muted-foreground mt-4">
                    <span>Size: {project.size}</span>
                    <span>Status: {project.status}</span>
                </div>
            </CardContent>
        </Card>
    );
}
