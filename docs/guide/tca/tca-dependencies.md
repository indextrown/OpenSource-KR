---
title: TCA Dependencies 사용법
description: TCA에서 @Dependency로 시간·UUID·API 같은 외부 의존성을 사용하고 테스트·Preview에서 재정의하며 사용자 정의 client를 등록하는 학습 순서를 안내합니다.
---

# TCA Dependencies 사용법

원문: [Dependencies](https://swiftpackageindex.com/pointfreeco/swift-dependencies/main/documentation/dependencies)

TCA에서 Dependencies는 기능이 제어할 수 없는 외부 세계를 다루는 방법이에요. 현재 시간, UUID, Clock, 네트워크 API, 파일 시스템, 사용자 기본값처럼 실행 결과가 매번 달라지거나 테스트·Preview에서 실제로 실행하면 곤란한 값을 `@Dependency`로 받아 사용합니다.

이 페이지는 **어떤 의존성을 어디에 선언하고, 테스트에서는 어떻게 바꾸는지**를 먼저 잡는 목차예요. 세부 API 설명은 아래 링크와 사이드바의 `Dependencies` 그룹에서 이어서 볼 수 있어요.

## 먼저 판단하세요

다음 중 하나라도 해당하면 의존성으로 분리하는 것이 좋아요.

- 현재 시각, UUID, 난수, timer처럼 실행할 때마다 값이 달라져요.
- 네트워크, 디스크, 사용자 기본값, 위치·알림 같은 외부 시스템에 접근해요.
- 테스트에서 실제 구현 대신 예측 가능한 값을 넣고 싶어요.
- Xcode Preview에서 실제 API 호출이나 대기 없이 화면을 확인하고 싶어요.

반대로 순수하게 입력을 받아 값을 계산하는 로직은 의존성으로 만들 필요가 없어요. Reducer의 일반 함수나 계산 로직으로 두는 편이 더 단순합니다.

## 가장 짧은 사용 흐름

### 1. 기능에 `@Dependency`를 선언해요

TCA는 `Dependencies`를 함께 사용하므로, 기본 제공 값은 key path로 바로 가져올 수 있어요. 예를 들어 현재 시간과 UUID가 필요한 reducer라면 다음처럼 선언합니다.

```swift
@Reducer
struct TodoFeature {
  @ObservableState
  struct State: Equatable {
    var todos: [Todo] = []
  }

  enum Action {
    case addButtonTapped
  }

  @Dependency(\.date.now) var now
  @Dependency(\.uuid) var uuid

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .addButtonTapped:
        state.todos.append(
          Todo(id: uuid(), createdAt: now)
        )
        return .none
      }
    }
  }
}
```

이제 `Date()`나 `UUID()`를 reducer 안에서 직접 호출하지 않습니다. 기능이 필요한 값을 명시적으로 선언했으므로 실행 환경에 따라 안전하게 바꿀 수 있어요.

### 2. 테스트에서 필요한 값만 재정의해요

`TestStore`를 만들 때 `withDependencies`로 테스트에 필요한 값만 바꾸면 됩니다.

```swift
@Test
func addTodo() async {
  let store = TestStore(initialState: TodoFeature.State()) {
    TodoFeature()
  } withDependencies: {
    $0.date.now = Date(timeIntervalSinceReferenceDate: 1_234_567_890)
    $0.uuid = .incrementing
  }

  await store.send(.addButtonTapped) {
    $0.todos = [
      Todo(
        id: UUID(uuidString: "00000000-0000-0000-0000-000000000000")!,
        createdAt: Date(timeIntervalSinceReferenceDate: 1_234_567_890)
      )
    ]
  }
}
```

테스트가 실제 시간이나 무작위 UUID에 의존하지 않으므로 빠르고 결정적으로 실행됩니다. clock을 쓴다면 `.immediate` clock으로 바꿔 실제 대기를 없앨 수도 있어요.

### 3. 직접 만든 API는 client로 등록해요

기본 제공 의존성에 없는 API client는 interface를 만들고 `DependencyValues`에 등록합니다. 가장 간단한 방식은 `@DependencyEntry`예요.

```swift
import Dependencies
import DependenciesMacros

struct TodosClient {
  var fetch: @Sendable () async throws -> [Todo]
}

extension DependencyValues {
  @DependencyEntry(liveValue: TodosClient.live)
  var todosClient: TodosClient
}
```

그러면 기능에서는 `@Dependency(\.todosClient)`로 사용하고, 테스트에서는 `$0.todosClient.fetch = { [] }`처럼 필요한 endpoint만 바꿀 수 있어요. live·Preview·test 구현을 분리해야 한다면 `DependencyKey`와 `TestDependencyKey`를 사용합니다.

## 상황별로 읽을 문서

| 지금 궁금한 것                                                    | 다음 문서                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 의존성이 왜 필요한지, 어떤 값을 분리해야 하는지                   | [What are dependencies?](./dependencies/what-are-dependencies.md)                                        |
| 기본 제공 `date`, `uuid`, `clock`을 바로 쓰는 방법                | [Quick start](./dependencies/quick-start.md), [Using dependencies](./dependencies/using-dependencies.md) |
| 직접 만든 API client를 등록하는 방법                              | [Registering dependencies](./dependencies/registering-dependencies.md)                                   |
| 실제 앱·Preview·테스트 구현을 나누는 방법                         | [Live, preview, and test dependencies](./dependencies/live-preview-test.md)                              |
| `TestStore`와 Swift Testing에서 재정의하는 방법                   | [Testing](./dependencies/testing.md)                                                                     |
| protocol, closure 기반 struct, `@DependencyClient` 중 무엇을 쓸지 | [Designing dependencies](./dependencies/designing-dependencies.md)                                       |
| 특정 기능이나 자식 기능에서 잠시 값을 바꾸는 방법                 | [Overriding dependencies](./dependencies/overriding-dependencies.md)                                     |
| task·escaping closure에서 의존성이 유지되는 방식                  | [Lifetimes](./dependencies/lifetimes.md)                                                                 |
| 앱 진입점 하나로 값을 전파하는 방법                               | [Single entry point systems](./dependencies/single-entry-point-systems.md)                               |

## 기억할 규칙

1. 기능이 외부 세계와 상호작용하면 `@Dependency`로 드러내요.
2. 운영 환경은 `liveValue`, Xcode Preview는 `previewValue`, 테스트는 `testValue` 또는 테스트별 재정의를 사용해요.
3. 테스트에서는 실제 네트워크·시간·파일 시스템을 사용하지 않도록 필요한 endpoint를 재정의해요.
4. client는 기능이 실제로 쓰는 endpoint만 작게 노출하면 테스트와 변경이 쉬워져요.

이 흐름을 익힌 뒤에는 아래 `Dependencies` 그룹에서 API의 세부 동작과 고급 패턴을 찾아보세요.
