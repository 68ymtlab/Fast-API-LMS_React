from enum import Enum

# ENUM定義

class DesctibedEnum(Enum):
  def __new__(cls, value, description=None):
    member = object.__new__(cls)
    member._value_ = value
    member.description = description # カスタム属性 'description'を追加
    return member
  
  # Enumを継承した際に、str型としても振舞うようにする
  def __str__(self):
    return str(self.value)
  
  def __html__(self):
    return str(self.value)

# Studentモデルのgrade列のENUM
class GradeEnum(DesctibedEnum):
  B1 = "B1", "学部1年"
  B2 = "B2", "学部2年"
  B3 = "B3", "学部3年"
  B4 = "B4", "学部4年"
  M1 = "M1", "修士1年"
  M2 = "M2", "修士2年"
  D1 = "D1", "博士1年"
  D2 = "D2", "博士2年"
  D3 = "D3", "博士3年"
  
# Studentモデルのdepartment列のENUM
class DepartmentEnum(DesctibedEnum):
  # 学部(~24年入学者)
  EM = "EM", "工学部_機械工学科"
  EA = "EA", "工学部_航空システム工学科"
  ER = "ER", "工学部_ロボティクス学科"
  EL = "EL", "工学部_電気電子工学科"
  EP = "EP", "工学部_情報工学科"
  EV = "EV", "工学部_環境土木工学科"
  FM = "FM", "情報フロンティア学部_メディア情報学科"
  FS = "FS", "情報フロンティア学部_経営情報学科"
  FY = "FY", "情報フロンティア学部_心理科学科"
  AA = "AA", "建築学部_建築学科"
  BC = "BC", "バイオ・化学部_環境・応用化学科"
  BB = "BB", "バイオ・化学部_応用バイオ学科"
  # 学部(24年入学者~)
  DM = "DM", "情報デザイン学部_経営情報学科"
  DE = "DE", "情報デザイン学部_環境デザイン創成学科"
  MM = "MM", "メディア情報学部_メディア情報学科"
  MP = "MP", "メディア情報学部_心理情報デザイン学科"
  CC = "CC", "情報理工学部_情報工学科"
  CA = "CA", "情報理工学部_知能情報システム学科"
  CR = "CR", "情報理工学部_ロボティクス学科"
  BE = "BE", "バイオ・化学部_環境・応用化学科"
  BS = "BS", "バイオ・化学部_生命・応用バイオ学科"
  KM = "KM", "工学部_機械工学科"
  KS = "KS", "工学部_先進機械システム工学科"
  KA = "KA", "工学部_航空宇宙工学科"
  KE = "KE", "工学部_電気エネルギーシステム工学科"
  KI = "KI", "工学部_電子情報システム工学科"
  KC = "KC", "工学部_環境土木工学科"
  AE = "AE", "建築学部_建築学科"
  AD = "AD", "建築学部_建築デザイン学科"
  # 大学院
  I = "I", "工学研究科_ビジネスアーキテクト専攻"
  Y = "Y", "工学研究科_システム設計工学専攻"
  D = "D", "工学研究科_情報工学専攻"
  B = "B", "工学研究科_バイオ・化学専攻"
  M = "M", "工学研究科_機械工学専攻"
  S = "S", "工学研究科_高信頼ものづくり専攻"
  E = "E", "工学研究科_電気電子工学専攻"
  C = "C", "工学研究科_環境土木工学専攻"
  A = "A", "工学研究科_建築学専攻"
  P = "P", "心理科学研究科_臨床心理学専攻"
  Z = "Z", "イノベーションマネジメント研究科_イノベーションマネジメント専攻"