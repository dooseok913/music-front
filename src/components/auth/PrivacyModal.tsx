import { X } from 'lucide-react'

interface PrivacyModalProps {
    isOpen: boolean
    onClose: () => void
}

const PrivacyModal = ({ isOpen, onClose }: PrivacyModalProps) => {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-2xl max-h-[80vh] bg-hud-bg-card border border-hud-border-primary rounded-lg shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-hud-border-secondary">
                    <h2 className="text-xl font-bold text-hud-text-primary">Privacy Policy</h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-hud-text-muted hover:text-hud-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[60vh] text-hud-text-secondary space-y-4">
                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">1. 개인정보 수집 항목</h3>
                        <p>
                            회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                            <li>필수 항목: 이메일 주소, 비밀번호, 닉네임</li>
                            <li>선택 항목: 프로필 이미지, 음악 취향 정보</li>
                            <li>자동 수집: 서비스 이용 기록, 접속 로그</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">2. 개인정보 수집 목적</h3>
                        <p>
                            수집된 개인정보는 다음의 목적을 위해 활용됩니다:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                            <li>회원 가입 및 관리</li>
                            <li>서비스 제공 및 맞춤형 콘텐츠 추천</li>
                            <li>서비스 개선 및 신규 서비스 개발</li>
                            <li>고객 문의 응대</li>
                        </ul>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">3. 개인정보 보유 기간</h3>
                        <p>
                            개인정보는 회원 탈퇴 시까지 보유하며, 탈퇴 후 즉시 파기합니다.
                            단, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">4. 개인정보 제3자 제공</h3>
                        <p>
                            회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다.
                            다만, 이용자의 동의가 있거나 법령에 의한 경우는 예외로 합니다.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">5. 이용자의 권리</h3>
                        <p>
                            이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제할 수 있습니다.
                            개인정보 관련 문의는 고객센터를 통해 가능합니다.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">6. 개인정보 보호</h3>
                        <p>
                            회사는 개인정보 보호를 위해 다음과 같은 조치를 취하고 있습니다:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                            <li>비밀번호 암호화 저장</li>
                            <li>SSL/TLS를 통한 데이터 전송 암호화</li>
                            <li>접근 권한 관리 및 보안 교육</li>
                        </ul>
                    </section>

                    <p className="text-sm text-hud-text-muted pt-4 border-t border-hud-border-secondary">
                        최종 업데이트: 2025년 1월
                    </p>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-hud-border-secondary">
                    <button
                        onClick={onClose}
                        className="w-full py-2 bg-hud-accent-primary text-hud-bg-primary font-semibold rounded-lg hover:bg-hud-accent-primary/90 transition-colors"
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    )
}

export default PrivacyModal
