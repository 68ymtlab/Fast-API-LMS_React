"use client";


import { Button } from "@/components/ui/button";
import { BookCheck, BrainCircuit, Target, Lightbulb, LogIn, Mail } from 'lucide-react';
import { useRef } from 'react';
import { motion, Variants } from "framer-motion";
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function LandingPage() {
  const router = useRouter();
  const featuresRef = useRef<HTMLDivElement>(null);
  const contactRef = useRef<HTMLDivElement>(null);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  
  const scrollToContact = () => {
    contactRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.2,
        duration: 0.8,
        ease: "easeOut"
      }
    }
  };
  
  return (
    <div className="bg-white text-black min-h-screen font-sans">
      <div className="fixed top-4 right-4 z-50">
        <Button 
          className="bg-black text-white hover:bg-gray-800 rounded-full shadow-lg"
          onClick={() => router.push("/login")}
        >
          <LogIn className="mr-2 h-4 w-4" /> ログイン
        </Button>
      </div>

      <main className="overflow-x-hidden">
        {/* --- ヒーローセクション --- */}
        <motion.header 
          // ▼▼▼ 余白を px-6 から px-8 に変更 ▼▼▼
          className="container mx-auto px-8 py-32 md:py-48 text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <h1 className="text-4xl md:text-7xl font-bold tracking-tighter leading-tight text-gray-900">
            学習支援システム
          </h1>
          <p className="mt-6 text-lg md:text-xl max-w-2xl mx-auto text-gray-600">
            あなたの理解度にパーソナライズされた問題を提案し、学習の理解度を深めます！
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-8 py-6 text-lg" onClick={scrollToFeatures}>
              システムの機能を見る <Lightbulb className="ml-2 h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-gray-300 hover:bg-gray-100 rounded-full px-8 py-6 text-lg" 
              onClick={() => router.push("/login")}
            >
              ログイン <LogIn className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </motion.header>

        {/* --- 画像デモセクション --- */}
        <section 
          // ▼▼▼ 余白を px-6 から px-8 に変更 ▼▼▼
          className="container mx-auto px-8 my-24"
        >
           <motion.div 
             className="relative w-full max-w-5xl mx-auto rounded-2xl border border-gray-200 shadow-xl shadow-gray-400/20 overflow-hidden"
             initial={{ opacity: 0, scale: 0.9 }}
             whileInView={{ opacity: 1, scale: 1 }}
             viewport={{ once: true, amount: 0.5 }}
             transition={{ duration: 0.7 }}
           >
             <div className="absolute top-0 left-0 w-full p-3 bg-gray-50/80 backdrop-blur-sm flex items-center">
               <div className="flex space-x-1.5">
                   <div className="w-3 h-3 rounded-full bg-red-500"></div>
                   <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                   <div className="w-3 h-3 rounded-full bg-green-500"></div>
               </div>
             </div>
             <Image
               src="/login-demo.png"
               alt="ログイン画面のデモ"
               width={1920}
               height={1080}
               className="object-cover"
               priority
             />
           </motion.div>
        </section>

        {/* --- 特徴セクション --- */}
        <section className="py-24 bg-slate-50" ref={featuresRef}>
          <div 
            // ▼▼▼ 余白を px-6 から px-8 に変更 ▼▼▼
            className="container mx-auto px-8"
          >
            <motion.h2 
              className="text-3xl md:text-5xl font-bold tracking-tighter text-center mb-16 text-gray-900"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              3つの特徴
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
              <FeatureCard
                icon={<Target className="h-8 w-8 text-blue-500" />}
                title="パーソナライズ学習"
                description="AIがあなたの解答を分析し、一人ひとりの理解度に合わせた最適な問題を出題し、効率的な学習をサポートします。"
              />
              <FeatureCard
                icon={<BrainCircuit className="h-8 w-8 text-blue-500" />}
                title="教科書の解説"
                description="解説付きなので、教科書では説明しきれない部分も詳しく説明します。"
              />
              <FeatureCard
                icon={<BookCheck className="h-8 w-8 text-blue-500" />}
                title="進捗の可視化"
                description="学習履歴や正答率をダッシュボードで見ることができます。自分の成長を実感しながら、モチベーションを維持できます。"
              />
            </div>
          </div>
        </section>

        {/* --- 連絡先フッター --- */}
        <footer className="py-12 mt-20 border-t border-gray-200" ref={contactRef}>
          <div 
            // ▼▼▼ 余白を px-6 から px-8 に変更 ▼▼▼
            className="container mx-auto px-8 text-center text-gray-600"
          >
            <p className="font-semibold text-lg text-gray-800">山本研究室</p>
            <a href="mailto:adplms.kit@gmail.com" className="mt-2 inline-block hover:text-blue-500 transition-colors">
              adplms.kit@gmail.com
            </a>
            <p className="text-sm mt-6">&copy; {new Date().getFullYear()} Yamamoto Lab. All rights reserved.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

// --- FeatureCard コンポーネント ---
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <motion.div 
      className="bg-white p-8 rounded-2xl border border-gray-200 hover:shadow-lg hover:-translate-y-1 transition-all"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div className="mb-4 inline-block bg-slate-100 p-3 rounded-lg">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-3 text-gray-900">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </motion.div>
  );
}