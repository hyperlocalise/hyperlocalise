import AppKit
import SwiftUI

struct LoginView: View {
    @Environment(AppModel.self) private var appModel
    @State private var appeared = false

    var body: some View {
        ZStack {
            AtmosphereBackground()

            VStack(spacing: 28) {
                Spacer(minLength: 40)

                VStack(alignment: .leading, spacing: 12) {
                    Text("Hyperlocalise")
                        .font(HLTheme.displayFont)
                        .foregroundStyle(HLTheme.ink)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 12)

                    Text("Find context. Ship the work.")
                        .font(HLTheme.titleFont)
                        .foregroundStyle(HLTheme.ink.opacity(0.88))
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)

                    Text("Sign in with WorkOS to chat with your localization agent from the menu bar of your Mac.")
                        .font(HLTheme.bodyFont)
                        .foregroundStyle(HLTheme.ink.opacity(0.7))
                        .frame(maxWidth: 420, alignment: .leading)
                        .opacity(appeared ? 1 : 0)
                }
                .frame(maxWidth: 520, alignment: .leading)

                HStack(spacing: 12) {
                    Button {
                        Task {
                            await appModel.signIn(from: NSApp.keyWindow)
                        }
                    } label: {
                        Text("Sign in with WorkOS")
                            .font(.headline)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(HLTheme.moss)
                    .disabled(appModel.statusMessage != nil)

                    if let status = appModel.statusMessage {
                        ProgressView()
                            .controlSize(.small)
                        Text(status)
                            .foregroundStyle(.secondary)
                    }
                }
                .opacity(appeared ? 1 : 0)

                if let error = appModel.errorMessage {
                    Text(error)
                        .foregroundStyle(.red)
                        .font(.callout)
                        .frame(maxWidth: 480, alignment: .leading)
                }

                Spacer()
            }
            .padding(48)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.86)) {
                appeared = true
            }
        }
    }
}
