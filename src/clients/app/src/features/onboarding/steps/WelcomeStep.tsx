import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo.png";

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  return (
    <div className="max-w-[800px] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#c9d1d9] mb-2">
          Welcome to Zuckerman
        </h1>
        <p className="text-[#8b949e]">
          AI Personal Agent Platform. Let's get you set up in a few simple steps.
        </p>
      </div>

      <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
          <h2 className="text-base font-semibold text-[#c9d1d9]">What we'll set up</h2>
          <p className="text-xs text-[#8b949e] mt-1">
            We'll guide you through configuring your environment
          </p>
        </div>
        <div className="p-6 space-y-6 bg-[#0d1117]">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex items-center justify-center w-5 h-5 rounded-full bg-[#238636]/10 text-[#3fb950]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-sm text-[#c9d1d9]">Configure LLM Provider</div>
              <div className="text-sm text-[#8b949e]">
                Choose your AI model provider and add API key. We support Anthropic, OpenAI, and more.
              </div>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="mt-1 flex items-center justify-center w-5 h-5 rounded-full bg-[#238636]/10 text-[#3fb950]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-sm text-[#c9d1d9]">Connect Chat Channel</div>
              <div className="text-sm text-[#8b949e]">
                Choose how you want to chat with your agent (WhatsApp, Telegram, Discord, etc.).
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="mt-1 flex items-center justify-center w-5 h-5 rounded-full bg-[#238636]/10 text-[#3fb950]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-sm text-[#c9d1d9]">Select Your Agent</div>
              <div className="text-sm text-[#8b949e]">
                Choose from a library of pre-configured agents or create your own custom assistant.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="mt-1 flex items-center justify-center w-5 h-5 rounded-full bg-[#30363d] text-[#8b949e]">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="space-y-1 text-[#8b949e]">
              <div className="font-semibold text-sm">Security Settings</div>
              <div className="text-sm">
                Optional: Configure sandbox environments and restrict what tools your agent can use.
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-[#161b22] border-t border-[#30363d] flex items-center justify-end gap-3">
          <Button 
            variant="ghost" 
            onClick={onSkip}
            className="text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d]"
          >
            Skip setup
          </Button>
          <Button 
            onClick={onNext}
            className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636] px-6"
          >
            Get started
          </Button>
        </div>
      </div>
    </div>
  );
}
