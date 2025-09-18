"use client";

import axiosInstance from "@/lib/axios";
import { useEffect, useRef } from "react";
import type { FC } from "react";

interface TcAccessTimeProps {
  page?: string;
  details?: string;
}

const TcAccessTime: FC<TcAccessTimeProps> = ({ page = "none", details = "" }) => {
  const startTimeRef = useRef<number | null>(null);
  const dateRef = useRef<string | null>(null);
  const propsRef = useRef({ page, details });

  useEffect(() => {
    propsRef.current = { page, details };
  }, [page, details]);

  useEffect(() => {
    // Get start time in milliseconds
    startTimeRef.current = new Date().getTime();

    // Get current date in 'Asia/Tokyo' timezone
    const tokyoDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    dateRef.current = tokyoDate; // YYYY-MM-DD format

    const postAccessTime = (time: number) => {
      const { page, details } = propsRef.current;
      if (!dateRef.current) return;

      const params = {
        date: dateRef.current,
        page: page,
        time: time,
        details: details,
      };

      axiosInstance.post("/add_access_history", params).catch((error) => {
        console.error("Error posting access time:", error);
      });
    };

    return () => {
      if (startTimeRef.current) {
        const endTime = new Date().getTime();
        const timeInSeconds = Math.round((endTime - startTimeRef.current) / 1000);
        postAccessTime(timeInSeconds);
      }
    };
  }, []);

  return null;
};

export default TcAccessTime;
