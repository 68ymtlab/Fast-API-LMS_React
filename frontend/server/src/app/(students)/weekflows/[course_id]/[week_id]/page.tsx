'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { StudentHeader } from '@/components/atoms/layout/StudentHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import withAuth from '@/hocs/withAuth';
import axios from '@/lib/axios';

// markdown.js の関数は別途用意されていると仮定
// import { markdownToHtml, reloadMathJax } from '@/components/methods/markdown';

interface Week {
  week_id: number;
  week_name: string;
  week_num: number;
  order: number;
}

interface Flow {
  id: number;
  title: string;
  description?: string;
  order_number: number;
}

interface UserInfo {
  id: number;
  name: string;
  email: string;
}

export const WeekFlowsPage = () => {
  const params = useParams();
  const course_id = params.course_id as string;
  const week_id = params.week_id as string;

  const [week, setWeek] = useState<Week | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // course_id と week_id が取得できてからAPIコールを実行
    if (!course_id || !week_id) {
      setLoading(false);
      return;
    }

    const homeProfile = () => {
      axios.get('/home_profile')
        .then(function (response) {
          setUserInfo(response.data);
        })
        .catch(function (error) {
          if (error.response?.status === 401) {
            setSessionError(true);
          } else {
            console.log(error.response);
          }
        });
    };

    const getWeek = () => {
      axios.get(`/get_week/${week_id}`)
        .then(function (response) {
          setWeek(response.data);
        })
        .catch(function (error) {
          console.error('週情報の取得に失敗しました:', error);
        });
    };

    const getWeekFlows = () => {
      axios.get(`/get_week_flows/${week_id}`)
        .then(function (response) {
          setFlows(response.data);
        })
        .catch(function (error) {
          console.error('演習問題の取得に失敗しました:', error);
        })
        .finally(() => {
          setLoading(false);
        });
    };

    homeProfile();
    getWeek();
    getWeekFlows();

  }, [course_id, week_id]);

  const handleStartFlow = (flowId: number) => {
    // 演習問題開始の処理
    console.log(`演習問題 ${flowId} を開始します`);
    // ここで実際の演習問題ページに遷移する処理を実装
  };

  if (sessionError) {
    return (
      <>
        <StudentHeader />
        <main className="pt-16">
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="container mx-auto px-4 py-8">
              <h2 className="text-2xl font-bold text-red-600 mb-4">セッションエラー</h2>
              <p>ログインが必要です。</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <StudentHeader />
        <main className="pt-16">
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <div className="container mx-auto px-4 py-8">
              <p>読み込み中...</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <StudentHeader />
      <main className="pt-16">
        <div className="min-h-screen bg-gray-100">
          <div className="container mx-auto px-4 py-8">
            {/* 週情報のヘッダー */}
            {week && (
              <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">
                  第{week.week_num}回　{week.week_name}の演習問題一覧
                </h1>
              </div>
            )}

            {/* 演習問題一覧 */}
            <div className="space-y-6">
              {flows.length > 0 ? (
                flows.map((flow, index) => (
                  <Card key={flow.id} className="w-full">
                    <CardHeader>
                      <CardTitle>演習問題{index + 1}</CardTitle>
                      <CardDescription>
                        {flow.description || '演習問題概要がここに表示されます'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        onClick={() => handleStartFlow(flow.id)}
                        className="w-auto"
                      >
                        演習問題を開始
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="w-full">
                  <CardContent className="pt-6">
                    <p className="text-center text-gray-500">
                      この週には演習問題がありません。
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default withAuth(WeekFlowsPage, ['学生', 'テスト']);