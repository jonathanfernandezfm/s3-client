import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Create an account</h1>
        <p className="text-muted-foreground">
          Get started with S3 Dock today
        </p>
      </div>
      <SignUp
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none border-0 w-full bg-transparent",
            headerTitle: "hidden",
            headerSubtitle: "hidden",
            socialButtonsBlockButton:
              "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
            socialButtonsBlockButtonText: "font-medium",
            dividerLine: "bg-border",
            dividerText: "text-muted-foreground",
            formFieldLabel: "text-foreground font-medium",
            formFieldInput:
              "bg-background border-input focus:ring-ring focus:border-ring",
            formButtonPrimary:
              "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
            footerActionLink: "text-primary hover:text-primary/90 font-medium",
            identityPreviewEditButton: "text-primary hover:text-primary/90",
            formFieldAction: "text-primary hover:text-primary/90",
            alert: "bg-destructive/10 text-destructive border-destructive/20",
          },
        }}
      />
    </div>
  );
}
