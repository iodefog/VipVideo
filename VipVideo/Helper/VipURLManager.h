//
//  VipURLManager.h
//  VipVideo
//
//  Created by LiHongli on 2017/10/20.
//  Copyright © 2017年 SV. All rights reserved.
//

#import <Cocoa/Cocoa.h>

#define KHLVipVideoRequestSuccess       @"KHLVipVideoRequestSuccess"
#define KHLVipVideoWillChangeCurrentApi @"KHLVipVideoWillChangeCurrentApi"
#define KHLVipVideoDidChangeCurrentApi  @"KHLVipVideoDidChangeCurrentApi"
#define KHLVipVideoDidCopyCurrentURL    @"KHLVipVideoDidCopyCurrentURL"
#define KHLVipVideoGoBackCurrentURL     @"KHLVipVideoGoBackCurrentURL"
#define KHLVipVideoGoForwardCurrentURL  @"KHLVipVideoGoForwardCurrentURL"
#define KHLVipVideoStopPlay             @"KHLVipVideoStopPlay"
#define KHLVipVideoEditApi              @"KHLVipVideoEditApi"

@interface VipUrlItem:NSObject

@property (nonatomic, strong) NSString *title;
@property (nonatomic, strong) NSString *url;
@property (nonatomic, assign) BOOL selected;

+ (instancetype)createTitle:(NSString *)title url:(NSString *)url;

@end

/*--------------------------*/

@interface VipURLManager : NSObject

// 最终的播放url
@property (nonatomic, strong) NSString *finalUrl;
@property (nonatomic, strong) NSString *m3u8Url;

// 网络数据已加载完毕
@property (nonatomic, assign) BOOL networkLoaded;

@property (nonatomic, strong) NSMutableArray *itemsArray;
@property (nonatomic, strong) NSMutableArray *platformItemsArray;

@property (nonatomic, strong) NSString *currentVipApi;
@property (nonatomic, assign) NSInteger currentIndex;

@property (nonatomic, strong) NSArray *vipListJsonArray;
@property (nonatomic, strong) NSArray *platformJsonArray;

+ (instancetype)sharedInstance;
- (void)changeVideoItem:(VipUrlItem *)item;

- (void)configurationVipMenu:(NSMenu *)menu;

- (NSMenuItem *)configurationAddCustomVipsMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationGoBackMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationGoForwardMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationQuitMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationChangeNextMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationChangeUpMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationShowMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationCreateMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationCopyMenuItem:(NSMenu *)menu;
- (NSMenuItem *)configurationOpenSafariItem:(NSMenu *)menu;
- (NSMenuItem *)configurationNativePlayMenuItem:(NSMenu *)menu;

+ (NSMenuItem *)addShowMenuItemTitle:(NSString *)title key:(unichar)key target:(id)target action:(SEL)action;

// vip解析源列表
- (void)transformVIPSJsonToModel:(NSArray *)jsonArray;
// 平台源列表
- (void)transformPlatformJsonToModel:(NSArray *)jsonArray;

// 调起本地MPV或者FFMPEG
- (void)nativePlay:(id)sender;

@end
