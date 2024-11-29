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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClerkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <div className="flex flex-col items-center w-full">
              <nav className="fixed top-0 left-0 right-0 flex justify-between px-2 border-b backdrop-blur-md zz-top">
                <div className="flex items-center gap-0.5">
                  <Image
                    src={"/LOGODOCS.png"}
                    alt={""}
                    className="h-auto"
                    width={50}
                    height={50}
                  />
                  <b className="text-lg">ItsDocs</b>
                </div>
                <div className="flex items-center gap-2">
                  <SignedOut>
                    <SignInButton />
                  </SignedOut>
                  <SignedIn>
                    <UserButton />
                  </SignedIn>
                  <ModeToggle />
                </div>
              </nav>
              <div className="absolute top-2 left-4 z-bottom w-[25px] h-[25px] bg-pink-700 blur-lg" />
              <div className="mt-16 border-l border-r w-full max-w-[800px]">
                {children}
              </div>
            </div>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
