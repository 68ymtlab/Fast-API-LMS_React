"use client";

import {useRouter} from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoveRight, Target, BrainCircuit, BookCheck, UserPlus, Lightbulb } from 'lucide-react';
import { useRef } from 'react';
import { useLoginUser } from "@/hooks/useLoginUser";

export default function AboutPage() {
 const loginRef = useRef<HTMLDivElement>(null);
 const featuresRef = useRef<HTMLDivElement>(null);

 const router = useRouter();

 const scrollToLogin = () => {
   loginRef.current?.scrollIntoView({ behavior: 'smooth' });
 };

 const scrollToFeatures = () => {
   featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
 };

 return (
   <div className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 min-h-screen">
     {/* ヒーローセクション */}
     <header className="container mx-auto px-4 py-20 text-center">
       <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-400 text-transparent bg-clip-text">
         線形代数学アダプターラーニング
       </h1>
       <p className="mt-6 text-lg md:text-xl max-w-3xl mx-auto text-gray-600 dark:text-gray-300">
         線形代数学の授業で活用しよう！
       </p>
       <div className="mt-8 space-x-4">
         <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => router.push("/login")}>
           ログインして始める <UserPlus className="ml-2 h-5 w-5" />
         </Button>
         <Button size="lg" variant="outline" onClick={scrollToFeatures}>
           機能紹介を見る <Lightbulb className="ml-2 h-5 w-5" />
         </Button>
       </div>
     </header>

     

     <main className="container mx-auto px-4 pb-24" ref={featuresRef}>
       {/* 特徴セクション */}
       <section>
         <h2 className="text-3xl font-bold tracking-tight text-center mb-12">
           サイトの主な特徴
         </h2>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
           <FeatureCard
             icon={<Target className="h-10 w-10 text-blue-500" />}
             title="アダプティブラーニング"
             description="あなたの解答状況をAIが分析。苦手な分野を特定し、理解度に応じた問題と解説を自動で提供します。"
           />
           <FeatureCard
             icon={<BrainCircuit className="h-10 w-10 text-blue-500" />}
             title="教科書問題"
             description="ベクトルや行列の変換を、実際に操作しながら視覚的に学べます。抽象的な概念を直感的に捉えましょう。"
           />
           <FeatureCard
             icon={<BookCheck className="h-10 w-10 text-blue-500" />}
             title="演習問題"
             description="基本的なベクトルの概念から、固有値・固有ベクトル、特異値分解まで、体系的に知識を積み上げられます。"
           />
         </div>
       </section>

       {/* CTAセクション */}
       
     </main>
   </div>
 );
}

// FeatureCard コンポーネント
interface FeatureCardProps {
 icon: React.ReactNode;
 title: string;
 description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
 return (
   <Card className="text-center bg-white dark:bg-gray-950 shadow-lg hover:shadow-xl transition-shadow duration-300">
     <CardHeader>
       <div className="mx-auto bg-blue-100 dark:bg-blue-900/50 rounded-full p-4 w-fit">
           {icon}
       </div>
       <CardTitle className="mt-4 text-xl font-semibold">{title}</CardTitle>
     </CardHeader>
     <CardContent>
       <p className="text-gray-600 dark:text-gray-300">{description}</p>
     </CardContent>
   </Card>
 );
}