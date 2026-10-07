"use client";

import dynamic from "next/dynamic";

const FeedbackToolbar = dynamic(() => import("agentation").then((module) => module.Agentation), {
  ssr: false,
});

export function DevelopmentFeedback() {
  return <FeedbackToolbar />;
}
