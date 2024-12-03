import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@/styles/ItsBtn.css";
import "@/styles/Clerk.css";
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import { ModeToggle } from "@/components/Theme/ModeToggle";
import { ThemeProvider } from "@/components/Theme/theme-provider";
import Image from "next/image";
import ProfileLink from "@/components/ProfileLink";
import Link from "next/link";
import { ItsConfirmProvider } from "@/components/ItsConfirmProvider";
import { Toaster } from "@/components/ui/toaster";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Its the Docs",
  description: "An easy way to create and share documentation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`w-full flex flex-col items-center ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClerkProvider>
          <ItsConfirmProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <div className="flex flex-col items-center w-full border-l border-r max-w-[800px] mt-16">
                <nav className="fixed top-0 left-0 right-0 flex justify-between px-2 border-b backdrop-blur-md zz-top">
                  <Link href="/" className="flex items-center gap-0.5">
                    <Image
                      src={"/LOGODOCS.png"}
                      alt={""}
                      className="h-auto"
                      width={50}
                      height={50}
                    />
                    <b className="text-lg">ItsDocs</b>
                  </Link>
                  <div className="flex items-center gap-4">
                    <span className="mr-2.5">
                      <ProfileLink />
                    </span>
                    <SignedOut>
                      <SignInButton />
                    </SignedOut>
                    <SignedIn>
                      <UserButton />
                    </SignedIn>
                    <ModeToggle />
                  </div>
                </nav>
                <div className="fixed top-2 left-4 z-bottom w-[25px] h-[25px] bg-pink-700 blur-lg" />
                {children}
              </div>
              <Toaster />
            </ThemeProvider>
          </ItsConfirmProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
