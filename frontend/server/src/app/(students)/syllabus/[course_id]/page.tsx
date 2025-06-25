"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import axios from "@/lib/axios";
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

// 型定義
interface SyllabusInfo {
  subject_class: string;
  subject_name: string;
  subject_credit: number;
  subject_code: string;
  subject_period: string;
  subject_keyword: string;
  subject_goals: string;
}

const SyllabusPage = () => {
  const params = useParams();
  const course_id = params?.course_id;
  const [syllabusInfo, setSyllabusInfo] = useState<SyllabusInfo | null>(null);
  const [keyword, setKeyword] = useState<string[]>([]);

  useEffect(() => {
    const getSyllabusInfo = async () => {
      try {
        const response = await axios.get(`/get_syllabus_info/${course_id}`, { withCredentials: true });
        setSyllabusInfo(response.data);
        setKeyword(response.data.subject_keyword.split(","));
      } catch (error) {
        // エラー処理
      }
    };
    if (course_id) getSyllabusInfo();
  }, [course_id]);

  if (!syllabusInfo) return null;

  return (
    <div className="flex flex-col items-center mt-10 gap-10 px-4 mb-16">
      <h1 className="font-bold">シラバス情報</h1>
      {/* シラバス情報カード */}
      <Card className="w-full max-w-6xl rounded-2xl">
        <CardHeader>
          <Label className="text-xl font-semibold text-gray-800">科目情報</Label>
        </CardHeader>
        <CardContent>
          <TableContainer component={Paper} sx={{ borderRadius: 4 }}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  {["授業科目区分", "科目名", "単位数", "科目コード", "開講時期"].map((title) => (
                    <TableCell
                      key={title}
                      align="center"
                      className="bg-primary"
                      sx={{
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: "1.08rem",
                        py: 2,
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      {title}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow sx={{ background: "#f8fafc" }}>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    {syllabusInfo.subject_class}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    {syllabusInfo.subject_name}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    {syllabusInfo.subject_credit}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    {syllabusInfo.subject_code}
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700 }}>
                    {syllabusInfo.subject_period}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* 学習・教育目標カード */}
      <Card className="w-full max-w-6xl rounded-2xl">
        <CardHeader>
          <Label className="text-xl font-semibold text-gray-800">授業科目の学習・教育目標</Label>
        </CardHeader>
        <CardContent>
          <TableContainer component={Paper} sx={{ borderRadius: 4 }}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell
                    align="center"
                    colSpan={2}
                    className="bg-primary"
                    sx={{
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: "1.13rem",
                      py: 2,
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    学習・教育目標の詳細
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell
                    align="center"
                    className="bg-primary"
                    sx={{
                      color: "#fff",
                      fontWeight: 700,
                      py: 2,
                      width: "30%",
                    }}
                  >
                    キーワード
                  </TableCell>
                  <TableCell
                    align="center"
                    className="bg-primary"
                    sx={{
                      color: "#fff",
                      fontWeight: 700,
                      py: 2,
                    }}
                  >
                    学習・教育目標
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow sx={{ background: "#f8fafc" }}>
                  <TableCell align="left" sx={{ p: 2, fontWeight: 700 }}>
                    {keyword.map((item, i) => (
                      <div key={item} style={{ marginBottom: "6px" }}>
                        {i + 1}. {item}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell align="left" sx={{ p: 2, fontWeight: 700 }}>
                    {syllabusInfo.subject_goals}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default SyllabusPage;
