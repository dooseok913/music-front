import { X } from 'lucide-react'

interface TermsModalProps {
    isOpen: boolean
    onClose: () => void
}

const TermsModal = ({ isOpen, onClose }: TermsModalProps) => {
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
                    <h2 className="text-xl font-bold text-hud-text-primary">Terms of Service</h2>
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
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">1. 서비스 이용 약관</h3>
                        <p>
                            본 약관은 ALPHA TEAM(이하 "회사")이 제공하는 MusicSpace 서비스(이하 "서비스")의
                            이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">2. 서비스 이용</h3>
                        <p>
                            서비스 이용을 위해서는 회원가입이 필요하며, 가입 시 정확한 정보를 제공해야 합니다.
                            회원은 자신의 계정 정보를 안전하게 관리할 책임이 있습니다.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">3. 콘텐츠 이용</h3>
                        <p>
                            서비스에서 제공되는 음악 콘텐츠는 개인적인 용도로만 이용 가능합니다.
                            무단 복제, 배포, 상업적 이용은 금지됩니다.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">4. 서비스 변경 및 중단</h3>
                        <p>
                            회사는 서비스의 내용을 변경하거나, 운영상 또는 기술상의 이유로 서비스를
                            일시적으로 중단할 수 있습니다. 이 경우 사전에 공지합니다.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">5. 면책 조항</h3>
                        <p>
                            회사는 천재지변, 전쟁, 기타 불가항력적인 사유로 인한 서비스 중단에 대해
                            책임을 지지 않습니다.
                        </p>
                    </section>

                    <section>
                        <h3 className="text-lg font-semibold text-hud-text-primary mb-2">6. 분쟁 해결</h3>
                        <p>
                            서비스 이용과 관련하여 분쟁이 발생한 경우, 회사와 이용자는 상호 협의하여
                            해결하도록 노력합니다.
                        </p>
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

export default TermsModal
