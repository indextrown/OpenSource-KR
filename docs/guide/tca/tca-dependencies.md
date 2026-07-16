---
title: TCA Dependencies 사용법
description: TCA에서 client를 직접 만들고 DependencyKey·DependencyValues·@Dependency로 등록해 테스트와 Preview에서 안전하게 재정의하는 흐름을 안내합니다.
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

### 3. 직접 만든 client를 `DependencyKey`로 등록해요

기본 제공 의존성에 없는 API는 client struct로 interface를 먼저 만들어요. TCA에서 기본으로 익힐 패턴은 client가 `DependencyKey`를 직접 준수하고, `DependencyValues`의 key path로 노출하는 방식입니다. 공식 TCA README도 이 흐름을 사용해요.

예를 들어 숫자에 관한 사실을 가져오는 API를 client로 분리해 보겠습니다.

```swift
import ComposableArchitecture
import Foundation

struct NumberFactClient {
  var fetch: (Int) async throws -> String
}
```

client에는 기능이 실제로 호출할 endpoint만 넣습니다. reducer가 `fetch`만 필요하다면 HTTP 라이브러리나 URLSession 전체를 넘기지 않아요. 그러면 기능의 경계가 작아지고 테스트도 필요한 동작만 재정의할 수 있습니다.

다음으로 실제 앱에서 쓸 live 구현을 `DependencyKey`에 제공합니다.

```swift
extension NumberFactClient: DependencyKey {
  static let liveValue = Self(
    fetch: { number in
      let (data, _) = try await URLSession.shared.data(
        from: URL(string: "http://number-trivia.com/\(number)")!
      )
      return String(decoding: data, as: UTF8.self)
    }
  )
}
```

마지막으로 `DependencyValues`를 확장해 `@Dependency`와 테스트 재정의에 사용할 key path를 만듭니다.

```swift
extension DependencyValues {
  var numberFact: NumberFactClient {
    get { self[NumberFactClient.self] }
    set { self[NumberFactClient.self] = newValue }
  }
}
```

### 4. reducer에서 client를 사용해요

이제 reducer는 client를 생성자 인자로 받지 않고 `@Dependency`로 꺼냅니다.

```swift
@Reducer
struct Feature {
  @Dependency(\.numberFact) var numberFact

  var body: some Reducer<State, Action> {
    Reduce { state, action in
      switch action {
      case .numberFactButtonTapped:
        return .run { [count = state.count] send in
          let fact = try await numberFact.fetch(count)
          await send(.numberFactResponse(fact))
        }

      // ...
      }
    }
  }
}
```

기기와 simulator에서는 `liveValue`가 자동으로 사용됩니다. 반면 테스트와 Preview에서는 필요한 구현을 안전하게 바꿀 수 있습니다.

### 5. `TestStore`에서 endpoint만 재정의해요

테스트는 네트워크를 호출하지 않고 `fetch` endpoint만 결정적인 값으로 바꿉니다.

```swift
@Test
func numberFact() async {
  let store = TestStore(initialState: Feature.State()) {
    Feature()
  } withDependencies: {
    $0.numberFact.fetch = { "\($0) is a good number" }
  }

  await store.send(.numberFactButtonTapped)
  await store.receive(.numberFactResponse("0 is a good number")) {
    $0.numberFact = "0 is a good number"
  }
}
```

`@DependencyEntry`는 같은 모듈에 기본 구현을 간단히 등록할 때 쓸 수 있는 Dependencies의 편의 매크로입니다. 하지만 live 구현을 앱 target이나 integration module로 분리하거나, TCA client의 live·Preview·test 동작을 명확히 관리해야 한다면 위처럼 `DependencyKey`와 `DependencyValues`를 직접 작성하는 편이 더 알기 쉽고 유연합니다.

## 상황별로 읽을 문서

| 지금 궁금한 것                                                    | 다음 문서                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 의존성이 왜 필요한지, 어떤 값을 분리해야 하는지                   | [What are dependencies?](./dependencies/what-are-dependencies.md)                                        |
| 기본 제공 `date`, `uuid`, `clock`을 바로 쓰는 방법                | [Quick start](./dependencies/quick-start.md), [Using dependencies](./dependencies/using-dependencies.md) |
| 직접 만든 TCA client를 등록하는 방법                              | [Registering dependencies](./dependencies/registering-dependencies.md)                                   |
| 실제 앱·Preview·테스트 구현을 나누는 방법                         | [Live, preview, and test dependencies](./dependencies/live-preview-test.md)                              |
| `TestStore`와 Swift Testing에서 재정의하는 방법                   | [Testing](./dependencies/testing.md)                                                                     |
| protocol, closure 기반 client, `@DependencyClient` 중 무엇을 쓸지 | [Designing dependencies](./dependencies/designing-dependencies.md)                                       |
| 특정 기능이나 자식 기능에서 잠시 값을 바꾸는 방법                 | [Overriding dependencies](./dependencies/overriding-dependencies.md)                                     |
| task·escaping closure에서 의존성이 유지되는 방식                  | [Lifetimes](./dependencies/lifetimes.md)                                                                 |
| 앱 진입점 하나로 값을 전파하는 방법                               | [Single entry point systems](./dependencies/single-entry-point-systems.md)                               |

## 기억할 규칙

1. 기능이 외부 세계와 상호작용하면 `@Dependency`로 드러내요.
2. 운영 환경은 `liveValue`, Xcode Preview는 `previewValue`, 테스트는 `testValue` 또는 테스트별 재정의를 사용해요.
3. 테스트에서는 실제 네트워크·시간·파일 시스템을 사용하지 않도록 필요한 endpoint를 재정의해요.
4. client는 기능이 실제로 쓰는 endpoint만 작게 노출하면 테스트와 변경이 쉬워져요.

이 흐름을 익힌 뒤에는 아래 `Dependencies` 그룹에서 API의 세부 동작과 고급 패턴을 찾아보세요.
